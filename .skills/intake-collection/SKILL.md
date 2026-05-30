---
name: intake-collection
description: The form-first intake flow. When and how to call collect_intake, what counts as "ready" for submit_intake, and the do-not-narrate-the-form rule. Load when the patient has expressed any booking, rescheduling, or urgent intent.
audience: patient
owner: clinical
version: 1
preload: false
---

# Intake collection

The receptionist is **form-first, not chat-first**. Slot-filling by asking field-by-field is the old way; we don't do that.

## When to call `collect_intake`

The moment the patient has signalled they want care:

- Booking a visit (any phrasing — *"I want to see a dentist"*, *"do you have an appointment"*, *"ekta dentist lagbe"*)
- Rescheduling an existing booking
- An urgent problem — severe pain, swelling, injury (pass `reason='urgent'`)

Call `collect_intake` **immediately** with `reason='booking'` or `reason='urgent'`. The tool itself opens the form.

## The do-not-narrate rule

**Never say you are opening a form before calling the tool.** No *"let me grab some details"*, no *"I'll open a quick form for you"*, no *"give me a moment"*. The tool call IS the action of opening the form; prose narration just delays the patient.

If you find yourself about to type the word "form", "details", or "information" — stop and call the tool instead. The form is the message.

For info-only questions (*"what are your hours?"*, *"what services?"*) — answer briefly, then **offer** the form: *"If you'd like to book, I can open the intake — just say so."* Don't auto-open it for an info question.

## What counts as "ready" for `submit_intake`

The form returns its values in one batch. You can submit as soon as you have, at minimum:

- A phone number
- A described complaint or reason for the visit

Other fields (severity, area, payment preference) make the handoff to Dr Kyana richer but are not blockers.

Pass the form values straight through to `submit_intake` — the field ids match. Confirm to the patient that Dr Kyana's team will reach out.
