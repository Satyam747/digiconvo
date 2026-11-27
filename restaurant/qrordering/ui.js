"use strict";
/* =============================================================================
   ui.js - small UI toolkit shared by the dashboard and the owner console:
   loader, dialogs (confirm / prompt / forms) and printing through a hidden frame.
   ============================================================================= */
function showLoader(text) { $("#loaderText").textContent = text || "Please wait..."; $("#globalLoader").classList.add("show"); }
function hideLoader() { $("#globalLoader").classList.remove("show"); }

/* ------------------------------------------------------------------------ dialogs ---- */
const Dialog = (() => {
  let resolver = null;
  const root = () => document.getElementById("dialog");
  function close(val) {
    const r = root();
    r.classList.remove("show"); r.innerHTML = ""; r.onclick = null;
    const f = resolver; resolver = null;
    if (f) f(val);
  }
  /* opts: { title, body(html), buttons:[{id,label,kind}], wide, onOpen(), onClick(id) -> undefined | {error} } */
  function open(opts) {
    return new Promise((resolve) => {
      if (resolver) { const prev = resolver; resolver = null; prev(null); }
      resolver = resolve;
      const r = root();
      r.innerHTML = `<div class="modalBox ${opts.wide ? "wide" : "narrow"}" role="dialog" aria-modal="true">
        <div class="modalHeader"><h2>${esc(opts.title)}</h2><button class="closeButton" type="button" data-dlg="__close" aria-label="Close">&times;</button></div>
        <div class="modalBody"><div id="dlgBody">${opts.body || ""}</div><div id="dlgError" class="formMsg" role="alert"></div>
        <div class="modalFooter">${(opts.buttons || []).map((b) =>
          `<button type="button" class="${esc(b.kind || "secondaryButton")}" data-dlg="${esc(b.id)}">${esc(b.label)}</button>`).join("")}</div></div></div>`;
      r.classList.add("show");
      r.onclick = async (ev) => {
        if (ev.target === r) { close(null); return; }
        const t = ev.target.closest("[data-dlg]");
        if (!t) return;
        const id = t.dataset.dlg;
        if (id === "__close") { close(null); return; }
        if (opts.onClick) {
          const btns = $$("[data-dlg]", r); btns.forEach((b) => { b.disabled = true; });
          let res;
          try { res = await opts.onClick(id); } catch (e) { res = { error: e.message || "Something went wrong." }; }
          btns.forEach((b) => { b.disabled = false; });
          if (res && res.error !== undefined) { const box = $("#dlgError", r); if (box) box.textContent = res.error; return; }   // keep the dialog open
        }
        close(id);
      };
      if (opts.onOpen) opts.onOpen(r);
      const first = r.querySelector("input,textarea,select");
      if (first) first.focus();
    });
  }
  return {
    open, close, isOpen: () => !!resolver,
    async confirm(message, o) {
      o = o || {};
      const id = await open({
        title: o.title || "Please confirm", body: `<p class="dlgText">${esc(message)}</p>`,
        buttons: [{ id: "no", label: o.cancelText || "Cancel" }, { id: "yes", label: o.confirmText || "Yes, continue", kind: o.danger ? "dangerButton" : "primaryButton" }]
      });
      return id === "yes";
    },
    async prompt(o) {
      let value = null;
      const id = await open({
        title: o.title, body: `<label class="dlgLabel" for="dlgInput">${esc(o.label || "")}</label>` +
          (o.multiline ? `<textarea id="dlgInput" class="dlgInput" maxlength="${num(o.maxlength, 200)}" placeholder="${esc(o.placeholder || "")}"></textarea>`
                       : `<input id="dlgInput" class="dlgInput" maxlength="${num(o.maxlength, 100)}" placeholder="${esc(o.placeholder || "")}" autocomplete="off">`),
        buttons: [{ id: "no", label: "Cancel" }, { id: "ok", label: o.okText || "OK", kind: o.danger ? "dangerButton" : "primaryButton" }],
        onClick(btn) {
          if (btn !== "ok") return;
          const v = $("#dlgInput").value.trim();
          if (v.length < num(o.minLength, 1)) return { error: o.minLength > 1 ? `Please enter at least ${o.minLength} characters.` : "This field is required." };
          value = v;
          if (o.onSubmit) return o.onSubmit(v);          // optional server call; { error } keeps the dialog open
        }
      });
      return id === "ok" ? value : null;
    },
    alert(title, bodyHtml) { return open({ title, body: bodyHtml, buttons: [{ id: "ok", label: "Close", kind: "primaryButton" }], wide: true }); }
  };
})();
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && Dialog.isOpen()) Dialog.close(null); });


const PRINT_CSS = (w) => `@page{margin:2mm}*{box-sizing:border-box}body{font-family:"Courier New",monospace;font-size:12px;color:#000;margin:0 auto;width:${w === 80 ? 72 : 48}mm}
.c{text-align:center}.b{font-weight:700}.big{font-size:16px}.hr{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}
td,th{padding:2px 2px;vertical-align:top}th{text-align:left;border-bottom:1px dashed #000}.r{text-align:right;white-space:nowrap}.itemCol{width:46%;word-break:break-word}.note{border:1px solid #000;padding:4px;margin-top:6px}`;

function printHtml(html) {
  const f = document.createElement("iframe");
  f.className = "printFrame"; f.setAttribute("aria-hidden", "true"); f.setAttribute("title", "print");
  f.onload = () => {
    try { f.contentWindow.focus(); f.contentWindow.print(); }
    catch (_) { showToast("Could not open the print dialog.", "error"); }
    setTimeout(() => f.remove(), 60000);
  };
  f.srcdoc = html;
  document.body.appendChild(f);
}
const docHtml = (title, css, body) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;


/* "2026-11-22 19:15:03" in the restaurant's timezone */
function fmtStamp(ts) {
  try { return new Intl.DateTimeFormat("sv-SE", { timeZone: tz(), dateStyle: "short", timeStyle: "medium" }).format(new Date(ts)); }
  catch (_) { return String(ts || ""); }
}
