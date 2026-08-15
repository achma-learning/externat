/* Service detail: grouped objectives with a persistent, keyboard-accessible
   validation tracker, an in-page filter, and search-term highlighting. */
(function () {
  "use strict";
  const E = window.Externat;
  const { DATA, h, $, param, serviceTotal, Progress, toast, norm, highlight } = E;

  E.mountTopbar(null);
  const slug = param("slug");
  const svc = DATA.services.find((s) => s.slug === slug);
  const main = $("#main");

  if (!svc) {
    document.title = "Introuvable · externat";
    main.append(h("div", { class: "empty" }, [
      h("b", { text: "Service introuvable" }),
      h("p", { text: "Ce module n'existe pas (ou plus)." }),
      h("a", { class: "btn primary", href: "index.html" }, ["← Tous les services"]),
    ]));
    return;
  }
  document.title = `${svc.name} · objectifs de stage`;

  const total = serviceTotal(svc);
  let gi = 0;
  const groups = svc.groups.map((g) => ({
    label: g.label,
    items: g.objectives.map((o) => ({ text: o, idx: gi++ })),
  }));

  // ---------- header ----------
  const yrs = svc.years.map((y) => `${y}ᵉ année`).join(", ");
  main.append(
    h("nav", { class: "crumbs" }, [
      h("a", { href: "index.html" }, ["Services"]),
      h("span", { text: "/" }),
      h("a", { href: `index.html?pole=${encodeURIComponent(svc.group)}` }, [svc.group]),
    ]),
    h("header", { class: "svc-head" }, [
      h("div", { class: "ico", text: svc.icon }),
      h("div", {}, [
        h("h1", { text: svc.name }),
        h("div", { class: "sub", text:
          `${svc.group}${yrs ? " · " + yrs : ""} · ${total} objectifs · ${groups.length} rubrique(s)` }),
      ]),
      h("div", { class: "actions" }, [
        h("a", { class: "btn primary", href: svc.pdf, download: "" }, [dl(), "Télécharger la fiche PDF"]),
        h("button", { class: "btn", type: "button", onclick: () => window.print() }, ["⎙ Imprimer"]),
        h("button", { class: "btn", type: "button", onclick: copyAll }, ["⧉ Copier"]),
      ]),
    ]),
  );

  // ---------- progress card ----------
  const progWrap = h("div", { class: "svc-prog" });
  main.append(progWrap);
  function renderProg() {
    const p = Progress.service(svc.slug, total);
    progWrap.innerHTML = "";
    progWrap.append(
      h("div", { class: "top" }, [
        h("div", { html: `<b>Validation du stage</b>` }),
        h("div", { class: "pct mono", text: p.pct + "%" }),
      ]),
      h("div", { class: "bar" }, [h("i", { style: `width:${p.pct}%` })]),
      h("div", { class: "hint" }, [
        `${p.done} / ${total} objectifs cochés · enregistré sur cet appareil. `,
        h("a", { href: "#", style: "color:var(--accent-ink);font-weight:700",
          onclick: (e) => { e.preventDefault(); Progress.reset(svc.slug); paint(); toast("Progression réinitialisée"); } },
          ["Réinitialiser"]),
      ]),
    );
  }

  // ---------- in-page filter ----------
  const filter = h("input", { id: "svcFilter", type: "search", autocomplete: "off",
    placeholder: `Filtrer les ${total} objectifs de ${svc.name}…` });
  const countEl = h("span", { class: "filtercount" });
  main.append(h("label", { class: "searchbox svc-filter", for: "svcFilter" }, [
    h("span", { html: E.svgSearch }), filter, countEl,
  ]));

  // ---------- objectives ----------
  const listWrap = h("div");
  main.append(listWrap);
  const liByIdx = {};
  groups.forEach((g) => {
    const grp = h("section", { class: "grp" });
    if (g.label)
      grp.append(h("h2", {}, [g.label, h("span", { class: "gc", text: `${g.items.length}` })]));
    const ul = h("ul", { class: "objs" });
    g.items.forEach((it) => {
      const txt = h("span", { class: "txt", text: it.text });
      const li = h("li", { class: "obj", "data-i": it.idx, role: "checkbox",
        tabindex: "0", "aria-checked": "false", "aria-label": it.text }, [
        h("span", { class: "box", "aria-hidden": "true", html: check() }),
        h("span", { class: "num mono", "aria-hidden": "true", text: String(it.idx + 1) }),
        txt,
      ]);
      li._txt = txt; li._raw = it.text;
      li.addEventListener("click", () => toggle(it.idx, li));
      li.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(it.idx, li); }
      });
      liByIdx[it.idx] = li;
      ul.append(li);
    });
    grp._ul = ul;
    grp.append(ul);
    listWrap.append(grp);
  });

  // peer navigation
  const peers = DATA.services.filter((s) => s.group === svc.group);
  const pos = peers.findIndex((s) => s.slug === svc.slug);
  const prev = peers[pos - 1], next = peers[pos + 1];
  main.append(h("div", { class: "filters", style: "margin:34px 0 50px;justify-content:space-between" }, [
    prev ? h("a", { class: "btn", href: `service.html?slug=${prev.slug}` }, [`← ${prev.name}`]) : h("span"),
    h("a", { class: "btn", href: "index.html" }, ["Tous les services"]),
    next ? h("a", { class: "btn", href: `service.html?slug=${next.slug}` }, [`${next.name} →`]) : h("span"),
  ]));

  // ---------- behaviour ----------
  function toggle(i, li) {
    const v = !Progress.isDone(svc.slug, i);
    Progress.set(svc.slug, i, v);
    li.classList.toggle("done", v);
    li.setAttribute("aria-checked", v ? "true" : "false");
    renderProg();
  }
  function paint() {
    E.$$("li.obj").forEach((li) => {
      const i = +li.getAttribute("data-i");
      const on = Progress.isDone(svc.slug, i);
      li.classList.toggle("done", on);
      li.setAttribute("aria-checked", on ? "true" : "false");
    });
    renderProg();
  }
  function applyFilter(termStr) {
    const t = norm(termStr).split(/\s+/).filter(Boolean);
    let shown = 0;
    Object.values(liByIdx).forEach((li) => {
      const hit = !t.length || t.every((x) => norm(li._raw).includes(x));
      li.classList.toggle("hide", !hit);
      li._txt.innerHTML = (hit && t.length) ? highlight(li._raw, t) : li._raw
        .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      if (hit) shown++;
    });
    // hide groups with no visible items
    E.$$(".grp").forEach((grp) => {
      const any = Array.from(grp._ul.children).some((li) => !li.classList.contains("hide"));
      grp.classList.toggle("hide", !any);
    });
    countEl.textContent = t.length ? `${shown} / ${total}` : "";
    countEl.classList.toggle("show", !!t.length);
  }
  filter.addEventListener("input", () => applyFilter(filter.value.trim()));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== filter) { e.preventDefault(); filter.focus(); filter.select(); }
    if (e.key === "Escape" && document.activeElement === filter) { filter.value = ""; applyFilter(""); }
  });

  function copyAll() {
    const lines = [`${svc.name} — objectifs de stage`, ""];
    groups.forEach((g) => {
      if (g.label) lines.push(`## ${g.label}`);
      g.items.forEach((it) => lines.push(`- [${Progress.isDone(svc.slug, it.idx) ? "x" : " "}] ${it.text}`));
      lines.push("");
    });
    (navigator.clipboard ? navigator.clipboard.writeText(lines.join("\n")) : Promise.reject())
      .then(() => toast("Objectifs copiés"), () => toast("Copie impossible"));
  }
  function check() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  }
  function dl() {
    const s = h("span");
    s.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/></svg>';
    return s;
  }

  paint();

  // carry over a search term from the dashboard
  const q0 = param("q");
  if (q0) {
    filter.value = q0;
    applyFilter(q0);
    const first = E.$$("li.obj:not(.hide)")[0];
    if (first) setTimeout(() => first.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
  }
})();
