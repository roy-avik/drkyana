// receptionist-webhook.gs — Google Apps Script web app for the AI receptionist.
//
// Deployment:
//   1. Create a Google Sheet in your Workspace account.
//   2. Open Apps Script (Extensions → Apps Script).
//   3. Paste this file's contents into Code.gs.
//   4. Run setupSheet() once to create tabs and headers.
//   5. Set Script Properties (Project Settings → Script Properties):
//        WEBHOOK_TOKEN  — shared secret matching VITE_SHEETS_TOKEN
//        SHEET_ID       — the Google Sheet ID (from the Sheet URL)
//   6. Deploy → New deployment → Web app →
//        Execute as: Me
//        Who has access: Anyone
//   7. Copy the deployment URL → set as VITE_SHEETS_WEBHOOK_URL repo secret.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return SpreadsheetApp.openById(id);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// doPost — intake submission
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expectedToken = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
    if (!body.token || body.token !== expectedToken) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }

    var ss = getSheet();
    var patient = body.patient || {};
    var intake  = body.intake  || {};

    // --- Upsert patient row ---
    var patientsTab = ss.getSheetByName('Patients');
    var pData = patientsTab.getDataRange().getValues();
    var phoneCol = 0; // column A = phone
    var existingRow = -1;
    for (var i = 1; i < pData.length; i++) {
      if (String(pData[i][phoneCol]).trim() === String(patient.phone).trim()) {
        existingRow = i + 1; // 1-indexed
        break;
      }
    }

    var now = new Date().toISOString();
    var patientRow = [
      patient.phone || '',
      patient.email || '',
      patient.name || '',
      patient.age || '',
      patient.gender || '',
      patient.conditions || '',
      patient.allergies || '',
      patient.medications || '',
      patient.lastVisit || '',
      patient.anxiety || '',
      patient.locale || 'en',
      existingRow > 0 ? pData[existingRow - 1][11] : now, // first_seen
      now // last_seen
    ];

    if (existingRow > 0) {
      patientsTab.getRange(existingRow, 1, 1, patientRow.length).setValues([patientRow]);
    } else {
      patientsTab.appendRow(patientRow);
    }

    // --- Append intake row ---
    var intakesTab = ss.getSheetByName('Intakes');
    var intakeId = Utilities.getUuid();
    var intakeRow = [
      intakeId,
      now,
      patient.phone || '',
      intake.intent || '',
      intake.triageLevel || '',
      intake.affectedArea || '',
      arrJoin(intake.symptoms),
      intake.duration || '',
      intake.severity || '',
      arrJoin(intake.triggers),
      intake.preferredArea || '',
      arrJoin(intake.preferredDays),
      intake.timeOfDay || '',
      intake.urgency || '',
      intake.payment || '',
      intake.suggestedChamber || '',
      (intake.rawMessage || '').substring(0, 500),
      'new', // status
      ''     // notes (Dr Kyana fills)
    ];
    intakesTab.appendRow(intakeRow);

    return jsonResponse({ ok: true, intakeId: intakeId });
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ ok: false, error: err.message });
  }
}

function arrJoin(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ---------------------------------------------------------------------------
// doGet — chamber data (public, no auth)
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var ss = getSheet();
    var chambersTab = ss.getSheetByName('Chambers');
    if (!chambersTab) return jsonResponse([]);

    var data = chambersTab.getDataRange().getValues();
    var headers = data[0];
    var results = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var active = String(row[5]).trim().toLowerCase();
      if (active !== 'yes' && active !== 'true') continue;

      results.push({
        name: row[0] || '',
        area: row[1] || '',
        days: splitTrim(row[2]),
        hours: row[3] || '',
        capabilities: splitTrim(row[4])
      });
    }

    var output = ContentService
      .createTextOutput(JSON.stringify(results))
      .setMimeType(ContentService.MimeType.JSON);
    return output;
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResponse([]);
  }
}

function splitTrim(v) {
  if (!v) return [];
  return String(v).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// setupSheet — run once to initialise tabs
// ---------------------------------------------------------------------------

function setupSheet() {
  var ss = getSheet();

  // --- Patients tab ---
  var patients = ss.getSheetByName('Patients') || ss.insertSheet('Patients');
  var pHeaders = [
    'phone', 'email', 'name', 'age_range', 'gender',
    'conditions', 'allergies', 'medications',
    'last_dental_visit', 'anxiety_level', 'locale',
    'first_seen', 'last_seen'
  ];
  patients.getRange(1, 1, 1, pHeaders.length).setValues([pHeaders]);
  patients.getRange(1, 1, 1, pHeaders.length)
    .setFontWeight('bold')
    .setBackground('#e8eaf6');
  patients.setFrozenRows(1);

  // --- Intakes tab ---
  var intakes = ss.getSheetByName('Intakes') || ss.insertSheet('Intakes');
  var iHeaders = [
    'intake_id', 'timestamp', 'phone',
    'intent', 'triage_level',
    'affected_area', 'symptoms', 'duration', 'severity', 'triggers',
    'preferred_area', 'preferred_days', 'time_of_day', 'urgency', 'payment',
    'suggested_chamber', 'raw_message',
    'status', 'notes'
  ];
  intakes.getRange(1, 1, 1, iHeaders.length).setValues([iHeaders]);
  intakes.getRange(1, 1, 1, iHeaders.length)
    .setFontWeight('bold')
    .setBackground('#e8eaf6');
  intakes.setFrozenRows(1);

  // Status column validation (column 18 = R)
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['new', 'contacted', 'scheduled', 'done', 'closed'])
    .setAllowInvalid(false)
    .build();
  intakes.getRange(2, 18, 500, 1).setDataValidation(statusRule);

  // Triage level conditional formatting (column 5 = E)
  var triageRange = intakes.getRange('E2:E500');
  var rules = intakes.getConditionalFormatRules();

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('RED')
    .setBackground('#ef4444').setFontColor('#ffffff')
    .setRanges([triageRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('ORANGE')
    .setBackground('#f97316').setFontColor('#ffffff')
    .setRanges([triageRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('YELLOW')
    .setBackground('#eab308').setFontColor('#000000')
    .setRanges([triageRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('GREEN')
    .setBackground('#22c55e').setFontColor('#ffffff')
    .setRanges([triageRange]).build());

  intakes.setConditionalFormatRules(rules);

  // --- Chambers tab ---
  var chambers = ss.getSheetByName('Chambers') || ss.insertSheet('Chambers');
  var cHeaders = [
    'chamber_name', 'area', 'days', 'hours', 'capabilities', 'active'
  ];
  chambers.getRange(1, 1, 1, cHeaders.length).setValues([cHeaders]);
  chambers.getRange(1, 1, 1, cHeaders.length)
    .setFontWeight('bold')
    .setBackground('#e8eaf6');
  chambers.setFrozenRows(1);

  // Active column validation (column 6 = F)
  var activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'])
    .setAllowInvalid(false)
    .build();
  chambers.getRange(2, 6, 100, 1).setDataValidation(activeRule);

  // Example row so Dr Kyana sees the format
  var exampleRow = [
    'Example Chamber', 'Dhanmondi', 'Sat, Mon, Wed', '10am-6pm', 'general, scaling, rct', 'Yes'
  ];
  if (chambers.getLastRow() < 2) {
    chambers.appendRow(exampleRow);
  }

  Logger.log('Setup complete — Patients, Intakes, Chambers tabs ready.');
}
