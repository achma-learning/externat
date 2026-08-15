/* Dashboard: search, filters, service cards, global progress.
   State (query + filters) is mirrored in the URL so views are shareable. */
(function () {
  "use strict";
  const E = window.Externat;
  const { DATA, h, $, norm, serviceTotal, Progress, highlight } = E;
  const services = DATA.services;
  const meta = DATA.meta;

  E.mountTopbar("home");
  $("#searchIcon").innerHTML = E.svgSearch;

  // ---- stats ----
  const c = meta.counts || {};
  $("#stats").append(
    statEl(c.services, "services"),
    statEl(c.objectives, "objectifs"),
    statEl(c.groups, "pôles"),
    statEl((meta.sources || []).length, "guides sources"),
  );
  function statEl(n, label) {
    return h("div", { class: "stat" }, [h("b", { class: "mono", text: String(n ?? "—") }), h("span", { text: label })]);
  }
  $("#footNote").textContent = `${meta.faculty} · ${meta.university}`;

  // ---- state (restored from URL) ----
  const url = new URLSearchParams(location.search);
  const state = {
    q: url.get("q") || "",
    group: url.get("pole") || null,
    year: url.get("annee") || null,
  };
  function pushUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.group) p.set("pole", state.group);
    if (state.year) p.set("annee", state.year);
    const qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  // group filters
  const groups = meta.groupOrder.filter((g) => services.some((s) => s.group === g));
  const gf = $("#groupFilters");
  gf.append(h("span", { class: "label", text: "Pôle" }));
  gf.append(chip("Tous", null, "group", services.length));
  groups.forEach((g) =>
    gf.append(chip(g, g, "group", services.filter((s) => s.group === g).length)));

  // year filters
  const years = [...new Set(services.flatMap((s) => s.years))].sort();
  if (years.length) {
    const yf = $("#yearFilters");
    yf.append(h("span", { class: "label", text: "Année" }));
    yf.append(chip("Toutes", null, "year"));
    years.forEach((y) =>
      yf.append(chip(`${y}ᵉ année`, y, "year",
        services.filter((s) => s.years.includes(y)).length)));
  }

  function chip(label, val, kind, n) {
    const el = h("button", { class: "chip", type: "button",
      onclick: () => { state[kind] = val; sync(kind); render(); } },
      [label, n != null ? h("span", { class: "n", text: String(n) }) : null]);
    el._val = val; el._kind = kind;
    return el;
  }
  function sync(kind) {
    E.$$(`.chip`).forEach((ch) => { if (ch._kind === kind) ch.classList.toggle("on", ch._val === state[kind]); });
  }
  sync("group"); sync("year");

  // ---- global progress ----
  function renderGlobal() {
    const g = Progress.overall(services);
    const box = $("#gprog");
    box.innerHTML = "";
    box.append(
      h("div", { class: "row" }, [
        h("span", { html: `Progression de validation — <b>${g.done}</b> / ${g.total} objectifs` }),
        h("b", { class: "mono", text: g.pct + "%" }),
      ]),
      h("div", { class: "bar" }, [h("i", { style: `width:${g.pct}%` })]),
    );
  }

  // ---- search box ----
  const q = $("#q");
  q.value = state.q;
  q.addEventListener("input", () => { state.q = q.value.trim(); render(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === "Escape" && document.activeElement === q) { q.value = ""; state.q = ""; render(); q.blur(); }
  });

  const terms = () => norm(state.q).split(/\s+/).filter(Boolean);

  function matches(s) {
    if (state.group && s.group !== state.group) return false;
    if (state.year && !s.years.includes(state.year)) return false;
    if (!state.q) return true;
    const t = terms();
    const hay = norm(s.name + " " + s.group + " " +
      s.groups.map((g) => (g.label || "") + " " + g.objectives.join(" ")).join(" "));
    return t.every((x) => hay.includes(x));
  }

  function matchedObjectives(s) {
    const t = terms();
    const out = [];
    s.groups.forEach((g) => g.objectives.forEach((o) => {
      const ho = norm(o);
      if (t.every((x) => ho.includes(x))) out.push(o);
    }));
    return out;
  }

  function render() {
    pushUrl();
    renderGlobal();
    const list = services.filter(matches);
    const res = $("#results");
    res.innerHTML = "";

    if (!list.length) {
      res.append(h("div", { class: "empty" }, [
        h("b", { text: "Aucun résultat" }),
        h("div", { text: "Essayez un autre mot-clé ou réinitialisez les filtres." }),
        h("button", { class: "btn", style: "margin-top:14px", onclick: reset }, ["Réinitialiser"]),
      ]));
      return;
    }

    if (state.q) {
      const ranked = list.map((s) => ({ s, hits: matchedObjectives(s) }))
        .sort((a, b) => b.hits.length - a.hits.length || a.s.name.localeCompare(b.s.name));
      const totalHits = ranked.reduce((n, r) => n + r.hits.length, 0);
      res.append(sectionTitle(`${list.length} service(s) · ${totalHits} objectif(s) trouvé(s)`));
      res.append(grid(ranked.map((r) => card(r.s, r.hits))));
    } else {
      (state.group ? [state.group] : groups).forEach((g) => {
        const items = list.filter((s) => s.group === g);
        if (!items.length) return;
        res.append(sectionTitle(g, items.length));
        res.append(grid(items.map((s) => card(s))));
      });
    }
  }
  function reset() { state.q = ""; state.group = null; state.year = null; q.value = ""; sync("group"); sync("year"); render(); }

  function sectionTitle(label, n) {
    return h("div", { class: "section-title" }, [
      h("h2", { text: label }),
      h("div", { class: "line" }),
      n != null ? h("span", { class: "tag", text: `${n}` }) : null,
    ]);
  }
  function grid(cards) { return h("div", { class: "grid" }, cards); }

  function href(s) {
    return `service.html?slug=${encodeURIComponent(s.slug)}` +
      (state.q ? `&q=${encodeURIComponent(state.q)}` : "");
  }

  function card(s, hits) {
    const total = serviceTotal(s);
    const p = Progress.service(s.slug, total);
    const tags = [];
    s.years.forEach((y) => tags.push(h("span", { class: "tag yr", text: `${y}ᵉ` })));
    tags.push(h("span", { class: "tag", text: s.group }));

    const el = h("div", { class: "card" }, [
      h("a", { class: "cardlink", href: href(s), "aria-label": s.name }),
      h("div", { class: "top" }, [
        h("div", { class: "ico", text: s.icon }),
        h("div", {}, [
          h("h3", { text: s.name }),
          h("div", { class: "sub", text: `${s.groups.length} rubrique(s)` }),
        ]),
      ]),
      h("div", { class: "tags" }, tags),
    ]);

    if (hits && hits.length) {
      const t = terms();
      const snips = h("div", { class: "snips" });
      hits.slice(0, 3).forEach((o) =>
        snips.append(h("div", { class: "snip", html: "› " + highlight(o, t) })));
      if (hits.length > 3)
        snips.append(h("div", { class: "snip more", text: `+ ${hits.length - 3} autre(s)` }));
      el.append(snips);
    }

    el.append(
      h("div", { class: "meter", title: `${p.pct}% validé` }, [h("i", { style: `width:${p.pct}%` })]),
      h("div", { class: "foot" }, [
        h("span", { class: "count", text: p.done ? `${p.done}/${total} validés`
          : (hits ? `${hits.length} trouvé(s) · ${total} obj.` : `${total} objectifs`) }),
        h("div", { class: "acts" }, [
          h("a", { class: "btn-sm", href: s.pdf, download: "", title: "Télécharger la fiche PDF" }, [iconDl(), "PDF"]),
          h("a", { class: "btn-sm solid", href: href(s) }, ["Ouvrir"]),
        ]),
      ]),
    );
    return el;
  }

  function iconDl() {
    const span = h("span");
    span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/></svg>';
    return span;
  }

  render();
})();
