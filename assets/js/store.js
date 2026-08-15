/* ===================================================================
   Shared layer: data access, theme, and the "second brain" progress
   tracker (localStorage). Loaded after data/objectives.js on every page.
   =================================================================== */
(function () {
  "use strict";
  const DATA = window.OBJECTIVES || { meta: {}, services: [] };

  // ---- small DOM helpers ----
  const h = (tag, attrs, children) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function")
        el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const param = (k) => new URLSearchParams(location.search).get(k);

  const flatObjectives = (svc) =>
    svc.groups.reduce((a, g) => a.concat(g.objectives), []);
  const serviceTotal = (svc) =>
    svc.count != null ? svc.count : flatObjectives(svc).length;
  const norm = (s) => (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  // ---- theme ----
  const THEME_KEY = "externat:theme";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    const btn = $("#themeBtn");
    if (btn) btn.textContent = t === "dark" ? "☀" : "☾";
  }
  function initTheme() {
    let t;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(t);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  // ---- progress (validation checklist) ----
  const PROG_KEY = "externat:progress:v1";
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem(PROG_KEY) || "{}"); }
  catch (e) { progress = {}; }
  function persist() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); } catch (e) {}
  }
  const Progress = {
    isDone(slug, i) { return !!(progress[slug] && progress[slug][i]); },
    set(slug, i, v) {
      if (!progress[slug]) progress[slug] = {};
      if (v) progress[slug][i] = 1; else delete progress[slug][i];
      if (!Object.keys(progress[slug]).length) delete progress[slug];
      persist();
    },
    count(slug) { return progress[slug] ? Object.keys(progress[slug]).length : 0; },
    reset(slug) { delete progress[slug]; persist(); },
    resetAll() { progress = {}; persist(); },
    service(slug, total) {
      const done = this.count(slug);
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
    overall(services) {
      let done = 0, total = 0;
      services.forEach((s) => { total += serviceTotal(s); done += Math.min(this.count(s.slug), serviceTotal(s)); });
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
  };

  // ---- toast ----
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = h("div", { class: "toast" }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ---- shared chrome (top bar) ----
  function mountTopbar(active) {
    const bar = $("#topbar");
    if (!bar) return;
    bar.innerHTML = "";
    bar.appendChild(h("div", { class: "wrap" }, [
      h("a", { class: "brand", href: "index.html" }, [
        h("span", { class: "logo", text: "✚" }),
        h("span", {}, [h("b", { text: "externat" }),
          h("small", { text: "objectifs de stage" })]),
      ]),
      h("nav", { class: "nav" }, [
        h("a", { href: "index.html", class: active === "home" ? "active" : "" },
          [h("span", { text: "Services" })]),
        h("a", { href: "guides.html", class: active === "guides" ? "active" : "" },
          [h("span", { text: "Guides & repères" })]),
        h("button", {
          class: "iconbtn", id: "themeBtn", title: "Thème clair / sombre",
          "aria-label": "Basculer le thème", onclick: toggleTheme,
        }),
      ]),
    ]));
    const t = document.documentElement.getAttribute("data-theme");
    $("#themeBtn").textContent = t === "dark" ? "☀" : "☾";
  }

  // ---- text helpers (search highlight) ----
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function highlight(text, terms) {
    const safe = esc(text);
    const words = (terms || []).filter(Boolean).map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter((t) => t.length > 1);
    if (!words.length) return safe;
    // match on an accent-insensitive copy, map spans back onto the original
    const bare = norm(text);
    const ranges = [];
    words.forEach((w) => {
      const nw = norm(w); let from = 0, i;
      while ((i = bare.indexOf(nw, from)) !== -1) { ranges.push([i, i + nw.length]); from = i + nw.length; }
    });
    if (!ranges.length) return safe;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let k = 1; k < ranges.length; k++) {
      const last = merged[merged.length - 1];
      if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
      else merged.push(ranges[k]);
    }
    let out = "", pos = 0;
    merged.forEach(([a, b]) => { out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; pos = b; });
    out += esc(text.slice(pos));
    return out;
  }

  initTheme();
  window.Externat = {
    DATA, h, $, $$, param, flatObjectives, serviceTotal, norm, esc, highlight,
    Progress, toast, mountTopbar, toggleTheme,
    svgSearch: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  };
})();
