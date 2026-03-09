// ==UserScript==
// @name         Jira Label Colors (Cloud UI)
// @namespace    https://github.com/skondakjian/jira-label-colors
// @version      0.1.0
// @description  Add persistent, user-configurable colors to Jira labels across boards, issue view, and lists (supports dynamic updates + export/import).
// @author       Stephenie Kondakjian
// @match        https://*.atlassian.net/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  // -----------------------------
  // Storage helpers (GM_* with fallback)
  // -----------------------------
  const STORAGE_KEY = "jiraLabelColorsConfig.v1";

  async function getValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return await GM_getValue(key, fallback);
    } catch (_) {}
    // Fallback: localStorage
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function setValue(key, value) {
    try {
      if (typeof GM_setValue === "function") return await GM_setValue(key, value);
    } catch (_) {}
    // Fallback: localStorage
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  // -----------------------------
  // Config model
  // -----------------------------
  const DEFAULT_CONFIG = {
    version: 1,
    autoAssignUnmapped: false, // user toggle
    // labelName -> { bg: "#RRGGBB", fg: "#RRGGBB" }
    map: {
      // example:
      // "ai-claude-cowork": { bg: "#6f42c1", fg: "#ffffff" }
    },
  };

  let config = null;

  // -----------------------------
  // Label detection (Cloud UI)
  // Based on your snippets: <a data-color="standard" ...>label-text</a>
  // -----------------------------
  function isLikelyLabelEl(el) {
    if (!(el instanceof HTMLElement)) return false;

    const hasDataColor = el.hasAttribute("data-color");
    if (!hasDataColor) return false;

    // Most label chips are <a> with JQL link to labels
    const href = el.getAttribute("href") || "";
    const looksLikeLabelLink =
      href.includes("jql=labels") ||
      href.includes("labels%20%3D") ||
      href.includes("labels%20%3D%20%22") ||
      href.includes("labels%20%3D%20%27") ||
      href.includes("labels%20%3D%20");

    // In some Jira surfaces, it may be rendered without href; still allow if text looks like a label chip
    const text = (el.textContent || "").trim();
    const looksChipish = text.length > 0 && text.length <= 64 && !text.includes("\n");

    return looksLikeLabelLink || looksChipish;
  }

  function getLabelText(el) {
    return (el.textContent || "").trim();
  }

  // -----------------------------
  // Styling application
  // -----------------------------
  const APPLIED_ATTR = "data-tm-label-colored";

  function ensureContrastFallback(bgHex) {
    // Simple luminance check: choose black/white
    const hex = (bgHex || "").replace("#", "");
    if (hex.length !== 6) return "#000000";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // relative luminance approximation
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55 ? "#111111" : "#ffffff";
  }

  function hashToColor(label) {
    // Deterministic HSL -> HEX-ish conversion (kept simple)
    // Produces mid-sat, mid-light colors that work in both light/dark UIs.
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const sat = 58;
    const light = 45;

    // hsl -> rgb
    const c = (1 - Math.abs(2 * light / 100 - 1)) * (sat / 100);
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light / 100 - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (hue < 60) [rp, gp, bp] = [c, x, 0];
    else if (hue < 120) [rp, gp, bp] = [x, c, 0];
    else if (hue < 180) [rp, gp, bp] = [0, c, x];
    else if (hue < 240) [rp, gp, bp] = [0, x, c];
    else if (hue < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];

    const r = Math.round((rp + m) * 255);
    const g = Math.round((gp + m) * 255);
    const b = Math.round((bp + m) * 255);

    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function applyColorToEl(el, bg, fg) {
    // Jira chips are often inline-flex. Use minimal overrides.
    el.style.backgroundColor = bg;
    el.style.color = fg;
    el.style.borderRadius = "4px";
    el.style.padding = "0 6px";
    el.style.lineHeight = "18px";
    el.style.display = "inline-flex";
    el.style.alignItems = "center";

    // Some chips have inner spans; ensure they inherit
    el.style.setProperty("--tm-label-bg", bg);
    el.style.setProperty("--tm-label-fg", fg);

    // Subtle border to improve visibility in both light/dark
    el.style.border = `1px solid rgba(0,0,0,0.12)`;
    el.style.boxShadow = "none";

    el.setAttribute(APPLIED_ATTR, "true");
  }

  function clearColorFromEl(el) {
    el.style.backgroundColor = "";
    el.style.color = "";
    el.style.borderRadius = "";
    el.style.padding = "";
    el.style.lineHeight = "";
    el.style.display = "";
    el.style.alignItems = "";
    el.style.border = "";
    el.style.boxShadow = "";
    el.removeAttribute(APPLIED_ATTR);
  }

  function colorizeLabels(root = document) {
    const candidates = root.querySelectorAll('[data-color]');
    for (const el of candidates) {
      if (!isLikelyLabelEl(el)) continue;

      const label = getLabelText(el);
      if (!label) continue;

      const mapped = config.map[label];
      if (mapped && mapped.bg) {
        const fg = mapped.fg || ensureContrastFallback(mapped.bg);
        applyColorToEl(el, mapped.bg, fg);
      } else if (config.autoAssignUnmapped) {
        const bg = hashToColor(label);
        const fg = ensureContrastFallback(bg);
        applyColorToEl(el, bg, fg);
      } else {
        // Ensure we don't leave stale styling if mapping was removed
        if (el.getAttribute(APPLIED_ATTR) === "true") clearColorFromEl(el);
      }
    }
  }

  // -----------------------------
  // UI (floating button + modal)
  // -----------------------------
  const UI_ID = "tm-jira-label-colors-ui";
  const BTN_ID = "tm-jira-label-colors-btn";
  const MODAL_ID = "tm-jira-label-colors-modal";

  function injectBaseStyles() {
    if (document.getElementById(UI_ID)) return;

    const style = document.createElement("style");
    style.id = UI_ID;
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        background: rgba(20,20,20,0.88);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        user-select: none;
      }
      #${BTN_ID}:hover { background: rgba(20,20,20,0.95); }

      #${MODAL_ID}-backdrop {
        position: fixed;
        inset: 0;
        z-index: 999998;
        background: rgba(0,0,0,0.35);
        display: none;
      }
      #${MODAL_ID} {
        position: fixed;
        right: 16px;
        bottom: 64px;
        z-index: 999999;
        width: 420px;
        max-height: 70vh;
        overflow: auto;
        background: rgba(255,255,255,0.96);
        color: #111;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 14px;
        box-shadow: 0 18px 60px rgba(0,0,0,0.24);
        padding: 12px;
        display: none;
        font: 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      }

      /* Dark mode support (Jira sets various attrs; keep robust) */
      @media (prefers-color-scheme: dark) {
        #${MODAL_ID} {
          background: rgba(25,25,25,0.96);
          color: #f1f1f1;
          border-color: rgba(255,255,255,0.14);
        }
        #${MODAL_ID} input, #${MODAL_ID} select {
          background: rgba(255,255,255,0.08);
          color: #f1f1f1;
          border-color: rgba(255,255,255,0.16);
        }
        #${MODAL_ID} .tm-subtle { color: rgba(255,255,255,0.72); }
        #${MODAL_ID} .tm-row { border-color: rgba(255,255,255,0.12); }
      }

      #${MODAL_ID} h3 {
        margin: 0 0 8px 0;
        font-size: 13px;
      }
      #${MODAL_ID} .tm-subtle { color: rgba(0,0,0,0.65); }
      #${MODAL_ID} .tm-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 8px 0 10px 0;
      }
      #${MODAL_ID} button {
        font: inherit;
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(255,255,255,0.9);
        cursor: pointer;
      }
      #${MODAL_ID} button:hover { background: rgba(255,255,255,1); }
      #${MODAL_ID} input[type="text"] {
        width: 140px;
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,0.14);
        outline: none;
      }
      #${MODAL_ID} input[type="color"] {
        width: 34px;
        height: 28px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
      }
      #${MODAL_ID} .tm-row {
        display: grid;
        grid-template-columns: 1fr 56px 56px 60px;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        border-top: 1px solid rgba(0,0,0,0.08);
      }
      #${MODAL_ID} .tm-row:first-of-type { border-top: none; }
      #${MODAL_ID} .tm-badgePreview {
        justify-self: start;
        border-radius: 6px;
        padding: 2px 8px;
        border: 1px solid rgba(0,0,0,0.12);
        display: inline-flex;
        align-items: center;
        height: 20px;
      }
      #${MODAL_ID} .tm-toggleRow {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0 10px 0;
      }
      #${MODAL_ID} .tm-footer {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(0,0,0,0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      #${MODAL_ID} .tm-footer small { opacity: 0.8; }
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    injectBaseStyles();

    // Floating button
    if (!document.getElementById(BTN_ID)) {
      const btn = document.createElement("div");
      btn.id = BTN_ID;
      btn.textContent = "Label Colors";
      btn.addEventListener("click", () => toggleModal(true));
      document.body.appendChild(btn);
    }

    // Backdrop
    if (!document.getElementById(`${MODAL_ID}-backdrop`)) {
      const backdrop = document.createElement("div");
      backdrop.id = `${MODAL_ID}-backdrop`;
      backdrop.addEventListener("click", () => toggleModal(false));
      document.body.appendChild(backdrop);
    }

    // Modal
    if (!document.getElementById(MODAL_ID)) {
      const modal = document.createElement("div");
      modal.id = MODAL_ID;
      document.body.appendChild(modal);
      renderModal();
    }

    // Tampermonkey menu commands
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Jira Label Colors: Open", () => toggleModal(true));
      GM_registerMenuCommand("Jira Label Colors: Export JSON", () => exportJSON());
      GM_registerMenuCommand("Jira Label Colors: Import JSON", () => importJSON());
      GM_registerMenuCommand("Jira Label Colors: Re-apply now", () => colorizeLabels(document));
    }
  }

  function toggleModal(open) {
    const modal = document.getElementById(MODAL_ID);
    const backdrop = document.getElementById(`${MODAL_ID}-backdrop`);
    if (!modal || !backdrop) return;

    modal.style.display = open ? "block" : "none";
    backdrop.style.display = open ? "block" : "none";

    if (open) renderModal();
  }

  function sortedLabelEntries() {
    return Object.entries(config.map).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    const rows = sortedLabelEntries()
      .map(([label, colors]) => {
        const bg = colors.bg || "#cccccc";
        const fg = colors.fg || ensureContrastFallback(bg);
        return `
          <div class="tm-row" data-label="${escapeHtml(label)}">
            <div>
              <div class="tm-badgePreview" style="background:${bg};color:${fg};">
                ${escapeHtml(label)}
              </div>
              <div class="tm-subtle" style="margin-top:4px;">${escapeHtml(bg)} / ${escapeHtml(fg)}</div>
            </div>
            <input type="color" class="tm-bg" title="Background" value="${escapeAttr(bg)}" />
            <input type="color" class="tm-fg" title="Text" value="${escapeAttr(fg)}" />
            <button class="tm-del" title="Remove mapping">Delete</button>
          </div>
        `;
      })
      .join("");

    modal.innerHTML = `
      <h3>Jira Label Colors</h3>
      <div class="tm-toggleRow">
        <input type="checkbox" id="tm-autoassign" ${config.autoAssignUnmapped ? "checked" : ""} />
        <label for="tm-autoassign">Auto-assign colors for unmapped labels</label>
      </div>

      <div class="tm-actions">
        <input id="tm-new-label" type="text" placeholder="label-name" />
        <input id="tm-new-bg" type="color" title="Background" value="#6f42c1" />
        <input id="tm-new-fg" type="color" title="Text" value="#ffffff" />
        <button id="tm-add">Add</button>
        <button id="tm-scan">Scan page → add any unmapped</button>
      </div>

      <div class="tm-subtle" style="margin: 6px 0 10px 0;">
        Applies to label chips across Jira (board, issue view, lists). Updates live as Jira renders.
      </div>

      <div id="tm-rows">
        ${rows || `<div class="tm-subtle">No mappings yet. Add one above, or “Scan page”.</div>`}
      </div>

      <div class="tm-footer">
        <div>
          <button id="tm-export">Export</button>
          <button id="tm-import">Import</button>
          <button id="tm-close">Close</button>
        </div>
        <small class="tm-subtle">Stored in Tampermonkey (per-browser)</small>
      </div>
    `;

    wireModalHandlers();
  }

  function wireModalHandlers() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    const auto = modal.querySelector("#tm-autoassign");
    auto?.addEventListener("change", async (e) => {
      config.autoAssignUnmapped = !!e.target.checked;
      await persistConfig();
      colorizeLabels(document);
    });

    modal.querySelector("#tm-add")?.addEventListener("click", async () => {
      const label = (modal.querySelector("#tm-new-label")?.value || "").trim();
      const bg = modal.querySelector("#tm-new-bg")?.value || "#cccccc";
      const fg = modal.querySelector("#tm-new-fg")?.value || ensureContrastFallback(bg);

      if (!label) return;

      config.map[label] = { bg, fg };
      await persistConfig();
      renderModal();
      colorizeLabels(document);
    });

    modal.querySelector("#tm-scan")?.addEventListener("click", async () => {
      const found = new Set();
      document.querySelectorAll("[data-color]").forEach((el) => {
        if (!isLikelyLabelEl(el)) return;
        const t = getLabelText(el);
        if (t) found.add(t);
      });

      let changed = false;
      for (const label of found) {
        if (!config.map[label]) {
          // add with deterministic color but user can adjust
          const bg = hashToColor(label);
          const fg = ensureContrastFallback(bg);
          config.map[label] = { bg, fg };
          changed = true;
        }
      }
      if (changed) {
        await persistConfig();
        renderModal();
        colorizeLabels(document);
      }
    });

    modal.querySelector("#tm-export")?.addEventListener("click", exportJSON);
    modal.querySelector("#tm-import")?.addEventListener("click", importJSON);
    modal.querySelector("#tm-close")?.addEventListener("click", () => toggleModal(false));

    // Per-row handlers: bg/fg changes + delete
    modal.querySelectorAll(".tm-row").forEach((row) => {
      const label = row.getAttribute("data-label");
      if (!label) return;

      row.querySelector(".tm-bg")?.addEventListener("input", async (e) => {
        const bg = e.target.value;
        const current = config.map[label] || {};
        const fg = current.fg || ensureContrastFallback(bg);
        config.map[label] = { bg, fg };
        await persistConfig();
        colorizeLabels(document);
        // refresh preview text without full rerender
        renderModal();
      });

      row.querySelector(".tm-fg")?.addEventListener("input", async (e) => {
        const fg = e.target.value;
        const current = config.map[label] || {};
        const bg = current.bg || "#cccccc";
        config.map[label] = { bg, fg };
        await persistConfig();
        colorizeLabels(document);
        renderModal();
      });

      row.querySelector(".tm-del")?.addEventListener("click", async () => {
        delete config.map[label];
        await persistConfig();
        renderModal();
        colorizeLabels(document);
      });
    });
  }

  // -----------------------------
  // Export / Import
  // -----------------------------
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportJSON() {
    const payload = JSON.stringify(config, null, 2);
    const ts = new Date().toISOString().slice(0, 10);
    downloadText(`jira-label-colors-${ts}.json`, payload);
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        return;
      }

      // Basic validation / merge behavior:
      // - require map to be an object
      // - keep autoAssignUnmapped if provided
      if (!parsed || typeof parsed !== "object") return;
      if (!parsed.map || typeof parsed.map !== "object") return;

      const merged = {
        ...DEFAULT_CONFIG,
        ...config,
        ...parsed,
        map: { ...(parsed.map || {}) },
      };

      config = merged;
      await persistConfig();
      renderModal();
      colorizeLabels(document);
    });
    input.click();
  }

  // -----------------------------
  // MutationObserver: handle Jira dynamic rendering
  // -----------------------------
  let observer = null;

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // new nodes
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) colorizeLabels(n);
          });
        }
        // attribute changes (sometimes Jira swaps text/attrs)
        if (m.type === "characterData" && m.target?.parentElement) {
          colorizeLabels(m.target.parentElement);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // -----------------------------
  // Misc helpers
  // -----------------------------
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", "");
  }

  async function persistConfig() {
    await setValue(STORAGE_KEY, config);
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    config = await getValue(STORAGE_KEY, null);
    if (!config || typeof config !== "object") {
      config = structuredClone(DEFAULT_CONFIG);
      await persistConfig();
    } else {
      // ensure defaults exist
      config = {
        ...DEFAULT_CONFIG,
        ...config,
        map: { ...(config.map || {}) },
      };
      await persistConfig();
    }

    buildUI();
    colorizeLabels(document);
    startObserver();

    // Optional: quick hotkey to open UI (Ctrl/Cmd + Shift + L)
    window.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        toggleModal(true);
      }
    });
  }

  init();
})();