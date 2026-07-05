/**
 * ui://drkyana/admin-view.html — the single MCP App template that renders any
 * DLS-styled View-DSL document (docs/view-dsl.md, docs/dls.md).
 *
 * Fully self-contained (inline CSS + vanilla JS, zero external origins): the
 * host CSP can be empty. Talks only JSON-RPC-over-postMessage to the host per
 * the MCP Apps extension:
 *   view → host: ui/initialize, ui/notifications/initialized, tools/call,
 *                ui/update-model-context, ui/notifications/size-changed
 *   host → view: ui/notifications/tool-result, ui/notifications/tool-cancelled,
 *                ui/notifications/host-context-changed, ui/resource-teardown
 *
 * Styling comes from the DLS tokens (@drkyana/types); host style variables
 * (McpUiStyles) override the neutral tokens at runtime so the view feels
 * native in Claude/other hosts. Brand tokens never yield.
 *
 * Security: documents are DATA. Every string renders via textContent; the
 * markdown node uses a restricted mini-renderer (no raw HTML pass-through).
 * The embedded script intentionally avoids backticks and "${" so this file's
 * template literal stays inert.
 */
import {
  DLS_TOKENS,
  DLS_TOKENS_DARK,
  DLS_HOST_VARIABLE_MAP,
  dlsVar,
  type DlsToken,
} from "@drkyana/types";

export const ADMIN_VIEW_RESOURCE_URI = "ui://drkyana/admin-view.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

function tokenBlock(tokens: Partial<Record<DlsToken, string>>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `  ${dlsVar(k as DlsToken)}: ${v};`)
    .join("\n");
}

/** Build the template HTML. Pure function of the DLS tokens — no request data. */
export function renderAdminViewTemplate(): string {
  const hostVarMap = JSON.stringify(DLS_HOST_VARIABLE_MAP);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dr Kyana — Admin view</title>
<style>
:root {
${tokenBlock(DLS_TOKENS)}
}
:root[data-theme="dark"] {
${tokenBlock(DLS_TOKENS_DARK)}
}
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body {
  font-family: var(--dk-font-sans);
  font-size: var(--dk-text-md);
  color: var(--dk-ink);
  padding: var(--dk-space-2);
}
#root { display: flex; flex-direction: column; gap: var(--dk-space-4); }
h1 { font-size: var(--dk-text-lg); font-weight: var(--dk-weight-semibold); }
h2 { font-size: var(--dk-text-sm); font-weight: var(--dk-weight-semibold); }
.subtitle { color: var(--dk-muted); font-size: var(--dk-text-sm); }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dk-space-2); }
.card {
  background: var(--dk-surface);
  border: var(--dk-border-width) solid var(--dk-border);
  border-radius: var(--dk-radius-md);
  box-shadow: var(--dk-shadow-sm);
  padding: var(--dk-space-4);
  display: flex; flex-direction: column; gap: var(--dk-space-3);
}
.chip {
  display: inline-block;
  padding: 1px 9px;
  border-radius: var(--dk-radius-full);
  font-size: var(--dk-text-xs);
  font-weight: var(--dk-weight-medium);
  background: var(--dk-surface-2);
  color: var(--dk-muted);
  border: var(--dk-border-width) solid var(--dk-border);
  white-space: nowrap;
}
.chip.tone-brand   { background: var(--dk-brand);   color: var(--dk-on-brand); border-color: transparent; }
.chip.tone-info    { color: var(--dk-info);    border-color: currentColor; background: transparent; }
.chip.tone-success { color: var(--dk-success); border-color: currentColor; background: transparent; }
.chip.tone-warning { color: var(--dk-warning); border-color: currentColor; background: transparent; }
.chip.tone-danger  { color: var(--dk-danger);  border-color: currentColor; background: transparent; }
.badges { display: flex; flex-wrap: wrap; gap: var(--dk-space-2); }
.callout {
  border-radius: var(--dk-radius-md);
  border: var(--dk-border-width) solid var(--dk-border);
  padding: var(--dk-space-3) var(--dk-space-4);
  font-size: var(--dk-text-sm);
  background: var(--dk-surface-2);
}
.callout.tone-info    { border-color: var(--dk-info);    color: var(--dk-info); }
.callout.tone-success { border-color: var(--dk-success); color: var(--dk-success); }
.callout.tone-warning { border-color: var(--dk-warning); color: var(--dk-warning); }
.callout.tone-danger  { border-color: var(--dk-danger);  color: var(--dk-danger); }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: var(--dk-text-sm); }
th {
  text-align: left; color: var(--dk-muted); font-weight: var(--dk-weight-medium);
  font-size: var(--dk-text-xs); text-transform: uppercase; letter-spacing: .04em;
  padding: var(--dk-space-2); border-bottom: var(--dk-border-width) solid var(--dk-border);
}
td { padding: var(--dk-space-2); border-bottom: var(--dk-border-width) solid var(--dk-border); vertical-align: top; }
tr:last-child td { border-bottom: none; }
td.end, th.end { text-align: right; }
tr.clickable { cursor: pointer; }
tr.clickable:hover td { background: var(--dk-surface-2); }
tr.rowtone-danger td:first-child { box-shadow: inset 3px 0 0 var(--dk-danger); }
tr.rowtone-warning td:first-child { box-shadow: inset 3px 0 0 var(--dk-warning); }
.kv { display: grid; gap: var(--dk-space-3); grid-template-columns: repeat(2, minmax(0,1fr)); }
.kv.cols-1 { grid-template-columns: 1fr; }
.kv.cols-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
.kv .label { font-size: var(--dk-text-xs); color: var(--dk-muted); text-transform: uppercase; letter-spacing: .04em; }
.kv .value { font-size: var(--dk-text-sm); overflow-wrap: anywhere; }
.kv .value.tone-danger { color: var(--dk-danger); font-weight: var(--dk-weight-medium); }
.muted { color: var(--dk-muted); }
p.text { font-size: var(--dk-text-sm); line-height: 1.55; }
.md { font-size: var(--dk-text-sm); line-height: 1.6; display: flex; flex-direction: column; gap: var(--dk-space-2); }
.md h3 { font-size: var(--dk-text-md); }
.md h4 { font-size: var(--dk-text-sm); }
.md ul, .md ol { padding-left: var(--dk-space-5); display: flex; flex-direction: column; gap: 2px; }
.md code { font-family: var(--dk-font-mono); font-size: var(--dk-text-xs); background: var(--dk-surface-2); padding: 1px 4px; border-radius: var(--dk-radius-sm); }
button {
  font: inherit; font-size: var(--dk-text-sm); font-weight: var(--dk-weight-medium);
  border-radius: var(--dk-radius-sm); border: var(--dk-border-width) solid var(--dk-border);
  background: var(--dk-surface); color: var(--dk-ink);
  padding: 6px 14px; cursor: pointer;
}
button:hover { border-color: var(--dk-accent); }
button:disabled { opacity: .5; cursor: default; }
button.tone-brand   { background: var(--dk-brand); border-color: var(--dk-brand); color: var(--dk-on-brand); }
button.tone-success { background: var(--dk-success); border-color: var(--dk-success); color: var(--dk-on-brand); }
button.tone-danger  { background: var(--dk-danger); border-color: var(--dk-danger); color: var(--dk-on-brand); }
.actions { display: flex; flex-wrap: wrap; gap: var(--dk-space-2); }
form.dk { display: flex; flex-direction: column; gap: var(--dk-space-3); }
form.dk .field { display: flex; flex-direction: column; gap: 4px; }
form.dk label { font-size: var(--dk-text-xs); color: var(--dk-muted); text-transform: uppercase; letter-spacing: .04em; }
input[type="text"], input[type="number"], textarea, select {
  font: inherit; font-size: var(--dk-text-sm); color: var(--dk-ink);
  background: var(--dk-surface); border: var(--dk-border-width) solid var(--dk-border);
  border-radius: var(--dk-radius-sm); padding: 7px 10px; width: 100%;
}
textarea { min-height: 140px; font-family: var(--dk-font-mono); font-size: var(--dk-text-xs); }
input:focus, textarea:focus, select:focus, button:focus-visible { outline: 2px solid var(--dk-accent); outline-offset: 1px; }
.checkline { display: flex; align-items: center; gap: var(--dk-space-2); font-size: var(--dk-text-sm); }
#flash { position: sticky; top: 0; z-index: 5; display: none; }
#flash.show { display: block; }
body.busy { opacity: .6; pointer-events: none; }
.unsupported { font-size: var(--dk-text-xs); color: var(--dk-muted); font-style: italic; }
</style>
</head>
<body>
<div id="flash" class="callout"></div>
<div id="root"><p class="text muted">Connecting to host…</p></div>
<script>
(function () {
  "use strict";
  var HOST_VAR_MAP = ${hostVarMap};
  var VIEW_DSL_VERSION = 1;
  var root = document.getElementById("root");
  var flash = document.getElementById("flash");
  var currentDoc = null;
  var hostCaps = {};

  // ---- JSON-RPC over postMessage -----------------------------------------
  var pending = {};
  var nextId = 1;
  function post(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function notify(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params || {} });
  }
  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && m.method === undefined) {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || "host error"));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") {
      onToolResult(m.params || {});
    } else if (m.method === "ui/notifications/tool-cancelled") {
      setBusy(false);
      showFlash("Tool call cancelled by host.", "warning");
    } else if (m.method === "ui/notifications/host-context-changed") {
      applyHostContext(m.params || {});
    } else if (m.id !== undefined && (m.method === "ui/resource-teardown" || m.method === "ping")) {
      post({ jsonrpc: "2.0", id: m.id, result: {} });
    }
  });

  // ---- Host context / DLS theming -----------------------------------------
  function applyHostContext(hc) {
    if (hc.theme) document.documentElement.setAttribute("data-theme", hc.theme);
    var vars = hc.styles && hc.styles.variables;
    if (vars) {
      Object.keys(HOST_VAR_MAP).forEach(function (token) {
        var v = vars[HOST_VAR_MAP[token]];
        if (v) document.documentElement.style.setProperty("--dk-" + token, v);
      });
    }
  }
  function sizeChanged() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height) + 16;
    notify("ui/notifications/size-changed", { height: h });
  }
  if (window.ResizeObserver) {
    new ResizeObserver(sizeChanged).observe(document.body);
  }

  // ---- Connect -------------------------------------------------------------
  request("ui/initialize", {
    appInfo: { name: "drkyana-admin-views", version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  }).then(function (res) {
    hostCaps = (res && res.hostCapabilities) || {};
    applyHostContext((res && res.hostContext) || {});
    notify("ui/notifications/initialized");
  }).catch(function (e) {
    showFlash("Failed to initialize with host: " + e.message, "danger");
  });

  // ---- Tool calls ----------------------------------------------------------
  function setBusy(b) { document.body.classList.toggle("busy", !!b); }
  function showFlash(text, tone) {
    flash.className = "callout show tone-" + (tone || "info");
    flash.textContent = text;
    if (tone === "success" || tone === "info") {
      setTimeout(function () { flash.className = "callout"; }, 4000);
    }
  }
  function firstText(result) {
    var c = (result && result.content) || [];
    for (var i = 0; i < c.length; i++) if (c[i].type === "text") return c[i].text;
    return "";
  }
  function updateModelContext(text) {
    if (!hostCaps.updateModelContext) return;
    request("ui/update-model-context", {
      content: [{ type: "text", text: text }]
    }).catch(function () {});
  }
  function callTool(call, action) {
    setBusy(true);
    request("tools/call", { name: call.tool, arguments: call.args || {} })
      .then(function (result) {
        setBusy(false);
        if (result && result.isError) {
          showFlash(firstText(result) || "The action failed.", "danger");
          return;
        }
        var view = result && result.structuredContent && result.structuredContent.view;
        if (view) {
          render(view);
          if (action) updateModelContext("Dr Kyana used the admin view: " + (firstText(result) || call.tool));
          return;
        }
        // Mutation without a view payload: report + re-render via refresh.
        var summary = firstText(result) || (call.tool + " done");
        showFlash(summary, "success");
        updateModelContext("Dr Kyana, via the admin view, ran " + call.tool + ": " + summary);
        if ((!action || action.refresh !== false) && currentDoc && currentDoc.refresh) {
          callTool(currentDoc.refresh, null);
        }
      })
      .catch(function (e) {
        setBusy(false);
        showFlash("Call failed: " + e.message, "danger");
      });
  }
  function runAction(action, extraArgs) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    var args = {};
    var k;
    if (extraArgs) for (k in extraArgs) args[k] = extraArgs[k];
    var fixed = action.call.args || {};
    for (k in fixed) args[k] = fixed[k];
    callTool({ tool: action.call.tool, args: args }, action);
  }

  function onToolResult(result) {
    setBusy(false);
    if (result && result.isError) {
      showFlash(firstText(result) || "Tool returned an error.", "danger");
      return;
    }
    var view = result && result.structuredContent && result.structuredContent.view;
    if (view) render(view);
    else showFlash("No view in tool result.", "warning");
  }

  // ---- DOM helpers ----------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function fmtDate(v, withTime) {
    var n = Number(v);
    if (!n) return "—";
    var d = new Date(n * 1000);
    return withTime ? d.toLocaleString() : d.toLocaleDateString();
  }
  function chip(spec) {
    if (spec === null || spec === undefined || spec === "") return el("span", "muted", "—");
    if (typeof spec !== "object") return el("span", "chip", spec);
    return el("span", "chip tone-" + (spec.tone || "neutral"), spec.text);
  }
  function formatCell(value, format) {
    if (format === "date") return el("span", null, fmtDate(value, false));
    if (format === "datetime") return el("span", null, fmtDate(value, true));
    if (format === "badge") return chip(value);
    if (format === "chips") {
      var wrap = el("span", "badges");
      (Array.isArray(value) ? value : []).forEach(function (t) { wrap.appendChild(chip(t)); });
      return wrap;
    }
    if (value === null || value === undefined || value === "") return el("span", "muted", "—");
    return el("span", null, value);
  }

  // Restricted markdown: headings, lists, paragraphs; inline bold + code.
  function inlineMd(target, text) {
    var parts = String(text).split(/(\\*\\*[^*]+\\*\\*|\`[^\`]+\`)/g);
    parts.forEach(function (part) {
      if (/^\\*\\*[^*]+\\*\\*$/.test(part)) target.appendChild(el("strong", null, part.slice(2, -2)));
      else if (/^\`[^\`]+\`$/.test(part)) target.appendChild(el("code", null, part.slice(1, -1)));
      else if (part) target.appendChild(document.createTextNode(part));
    });
  }
  function renderMarkdown(md) {
    var box = el("div", "md");
    var lines = String(md).split(/\\r?\\n/);
    var list = null;
    function closeList() { list = null; }
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { closeList(); return; }
      var h = t.match(/^(#{1,6})\\s+(.*)$/);
      if (h) {
        closeList();
        var level = Math.min(h[1].length + 2, 6);
        var hn = el("h" + level, null);
        inlineMd(hn, h[2]);
        box.appendChild(hn);
        return;
      }
      var li = t.match(/^(?:[-*]|\\d+[.)])\\s+(.*)$/);
      if (li) {
        var ordered = /^\\d/.test(t);
        if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
          list = el(ordered ? "ol" : "ul", null);
          box.appendChild(list);
        }
        var item = el("li", null);
        inlineMd(item, li[1]);
        list.appendChild(item);
        return;
      }
      closeList();
      var p = el("p", null);
      inlineMd(p, t);
      box.appendChild(p);
    });
    return box;
  }

  // ---- Node renderers --------------------------------------------------------
  function renderNode(node) {
    if (!node || typeof node !== "object") return null;
    switch (node.type) {
      case "section": {
        var card = el("div", "card");
        if (node.title) card.appendChild(el("h2", null, node.title));
        (node.children || []).forEach(function (c) {
          var n = renderNode(c);
          if (n) card.appendChild(n);
        });
        return card;
      }
      case "text": {
        return el("p", "text" + (node.muted ? " muted" : ""), node.text);
      }
      case "markdown": return renderMarkdown(node.markdown);
      case "badges": {
        var wrap = el("div", "badges");
        (node.badges || []).forEach(function (b) { wrap.appendChild(chip(b)); });
        return wrap;
      }
      case "callout": {
        return el("div", "callout tone-" + (node.tone || "info"), node.text);
      }
      case "keyvalue": {
        var grid = el("div", "kv cols-" + (node.columns || 2));
        (node.items || []).forEach(function (item) {
          var cell = el("div", null);
          cell.appendChild(el("div", "label", item.label));
          var val = el("div", "value" + (item.tone ? " tone-" + item.tone : ""));
          val.appendChild(formatCell(item.value, item.format || "text"));
          cell.appendChild(val);
          grid.appendChild(cell);
        });
        return grid;
      }
      case "actions": {
        var bar = el("div", "actions");
        (node.actions || []).forEach(function (a) {
          var btn = el("button", a.tone ? "tone-" + a.tone : null, a.label);
          btn.addEventListener("click", function () { runAction(a, null); });
          bar.appendChild(btn);
        });
        return bar;
      }
      case "table": return renderTable(node);
      case "form": return renderForm(node);
      default:
        return el("p", "unsupported", "[unsupported block: " + String(node.type) + "]");
    }
  }

  function renderTable(node) {
    var wrap = el("div", "tablewrap");
    var rows = node.rows || [];
    if (!rows.length) {
      wrap.appendChild(el("p", "text muted", node.empty || "Nothing here."));
      return wrap;
    }
    var table = el("table", null);
    var thead = el("thead", null);
    var hr = el("tr", null);
    (node.columns || []).forEach(function (col) {
      hr.appendChild(el("th", col.align === "end" ? "end" : null, col.label));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el("tbody", null);
    rows.forEach(function (row, i) {
      var tone = node.rowTones && node.rowTones[i];
      var tr = el("tr", tone ? "rowtone-" + tone : null);
      (node.columns || []).forEach(function (col) {
        var td = el("td", col.align === "end" ? "end" : null);
        td.appendChild(formatCell(row[col.key], col.format || "text"));
        tr.appendChild(td);
      });
      if (node.onRowOpen && row[node.onRowOpen.rowKey]) {
        tr.className += " clickable";
        tr.addEventListener("click", function () {
          var open = node.onRowOpen;
          var args = {};
          var fixed = open.call.args || {};
          for (var k in fixed) args[k] = fixed[k];
          args[open.argKey] = row[open.rowKey];
          callTool({ tool: open.call.tool, args: args }, { refresh: false });
        });
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderForm(node) {
    var card = el("div", "card");
    if (node.title) card.appendChild(el("h2", null, node.title));
    var form = el("form", "dk");
    var inputs = [];
    (node.fields || []).forEach(function (f) {
      if (f.type === "hidden") {
        inputs.push({ f: f, get: function () { return f.value; } });
        return;
      }
      var field = el("div", "field");
      var input;
      if (f.type === "textarea") {
        input = el("textarea", null);
        input.value = f.value === undefined || f.value === null ? "" : String(f.value);
      } else if (f.type === "select") {
        input = el("select", null);
        (f.options || []).forEach(function (o) {
          var opt = el("option", null, o.label);
          opt.value = o.value;
          input.appendChild(opt);
        });
        input.value = f.value === undefined || f.value === null ? "" : String(f.value);
      } else if (f.type === "checkbox") {
        input = el("input", null);
        input.type = "checkbox";
        input.checked = !!f.value;
      } else {
        input = el("input", null);
        input.type = f.type === "number" ? "number" : "text";
        input.value = f.value === undefined || f.value === null ? "" : String(f.value);
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      if (f.required && input.tagName !== "SELECT") input.required = true;
      if (f.type === "checkbox") {
        var line = el("label", "checkline");
        line.appendChild(input);
        line.appendChild(document.createTextNode(f.label || f.name));
        field.appendChild(line);
      } else {
        if (f.label) field.appendChild(el("label", null, f.label));
        field.appendChild(input);
      }
      form.appendChild(field);
      inputs.push({
        f: f,
        get: function () {
          if (f.type === "checkbox") return input.checked;
          if (f.type === "number") return input.value === "" ? undefined : Number(input.value);
          return input.value;
        }
      });
    });
    var submit = el("button", "tone-" + (node.submit.tone || "brand"), node.submit.label);
    submit.type = "submit";
    form.appendChild(submit);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var args = {};
      for (var i = 0; i < inputs.length; i++) {
        var f = inputs[i].f;
        var v = inputs[i].get();
        if (v === "" || v === undefined) continue;
        if (f.json && typeof v === "string") {
          try { v = JSON.parse(v); }
          catch (e) { showFlash("Field \\"" + (f.label || f.name) + "\\" must be valid JSON.", "danger"); return; }
        }
        args[f.name] = v;
      }
      runAction(node.submit, args);
    });
    card.appendChild(form);
    return card;
  }

  // ---- Document ---------------------------------------------------------------
  function render(doc) {
    currentDoc = doc;
    root.textContent = "";
    if (!doc || doc.v !== VIEW_DSL_VERSION) {
      root.appendChild(el("div", "callout tone-danger",
        "This view uses an unsupported view-DSL version. Update the admin MCP server or the host."));
      return;
    }
    var head = el("div", "head");
    head.appendChild(el("h1", null, doc.title));
    (doc.badges || []).forEach(function (b) { head.appendChild(chip(b)); });
    root.appendChild(head);
    if (doc.subtitle) root.appendChild(el("p", "subtitle", doc.subtitle));
    (doc.children || []).forEach(function (node) {
      var n = renderNode(node);
      if (n) root.appendChild(n);
    });
    sizeChanged();
  }
})();
</script>
</body>
</html>
`;
}
