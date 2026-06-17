/* Service detail: grouped objectives with a persistent validation tracker. */
(function () {
  "use strict";
  const E = window.Externat;
  const { DATA, h, $, param, serviceTotal, Progress, toast } = E;

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
  // assign a stable global index to each objective (flatten order)
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
      h("span", { text: svc.group }),
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
        h("button", { class: "btn", onclick: () => window.print() }, ["⎙ Imprimer"]),
        h("button", { class: "btn", onclick: copyAll }, ["⧉ Copier"]),
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

  // ---------- objectives ----------
  const listWrap = h("div");
  main.append(listWrap);
  groups.forEach((g) => {
    const grp = h("section", { class: "grp" });
    if (g.label)
      grp.append(h("h2", {}, [g.label, h("span", { class: "gc", text: `${g.items.length}` })]));
    const ul = h("ul", { class: "objs" });
    g.items.forEach((it) => {
      const li = h("li", { class: "obj", "data-i": it.idx, onclick: () => toggle(it.idx, li) }, [
        h("span", { class: "box", html: check() }),
        h("span", { class: "num mono", text: String(it.idx + 1) }),
        h("span", { class: "txt", text: it.text }),
      ]);
      ul.append(li);
    });
    grp.append(ul);
    listWrap.append(grp);
  });

  // footer nav between services in same group
  const peers = DATA.services.filter((s) => s.group === svc.group);
  const pos = peers.findIndex((s) => s.slug === svc.slug);
  const prev = peers[pos - 1], next = peers[pos + 1];
  const navRow = h("div", { class: "filters", style: "margin:34px 0 50px;justify-content:space-between" }, [
    prev ? h("a", { class: "btn", href: `service.html?slug=${prev.slug}` }, [`← ${prev.name}`]) : h("span"),
    h("a", { class: "btn", href: "index.html" }, ["Tous les services"]),
    next ? h("a", { class: "btn", href: `service.html?slug=${next.slug}` }, [`${next.name} →`]) : h("span"),
  ]);
  main.append(navRow);

  // ---------- behaviour ----------
  function toggle(i, li) {
    const v = !Progress.isDone(svc.slug, i);
    Progress.set(svc.slug, i, v);
    li.classList.toggle("done", v);
    renderProg();
  }
  function paint() {
    E.$$("li.obj").forEach((li) => {
      const i = +li.getAttribute("data-i");
      li.classList.toggle("done", Progress.isDone(svc.slug, i));
    });
    renderProg();
  }
  function copyAll() {
    const lines = [`${svc.name} — objectifs de stage`, ""];
    groups.forEach((g) => {
      if (g.label) lines.push(`## ${g.label}`);
      g.items.forEach((it) => lines.push(`- [${Progress.isDone(svc.slug, it.idx) ? "x" : " "}] ${it.text}`));
      lines.push("");
    });
    const txt = lines.join("\n");
    navigator.clipboard?.writeText(txt).then(
      () => toast("Objectifs copiés"),
      () => toast("Copie impossible"));
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
})();
