/* Guides page: embedded full PDFs, methods glossary, evaluation scheme. */
(function () {
  "use strict";
  const E = window.Externat;
  const { DATA, h, $ } = E;
  const meta = DATA.meta;

  E.mountTopbar("guides");
  $("#footNote").textContent = `${meta.faculty} · ${meta.university}`;

  // ---- full guides ----
  const g = $("#guides");
  (meta.sources || []).forEach((src) => {
    g.append(h("article", { class: "guide" }, [
      h("div", { class: "frame" }, [
        h("iframe", { src: `${src.file}#view=FitH`, title: src.name, loading: "lazy" }),
      ]),
      h("div", { class: "meta" }, [
        h("h3", { text: src.name }),
        h("p", { text: src.desc }),
        h("div", { class: "row" }, [
          h("a", { class: "btn primary", href: src.file, target: "_blank", rel: "noopener" }, ["Ouvrir en plein écran"]),
          h("a", { class: "btn", href: src.file, download: "" }, ["Télécharger"]),
          h("span", { class: "pill", text: `${src.pages} pages · PDF` }),
        ]),
      ]),
    ]));
  });

  // download-all (combined generated checklist)
  if (meta.fullPdf) {
    g.parentElement.insertBefore(
      h("div", { class: "filters", style: "margin:6px 0 0" }, [
        h("a", { class: "btn", href: meta.fullPdf, download: "" },
          ["⬇ Fiche unique — tous les objectifs (généré)"]),
      ]), $("#glossary"));
  }

  // ---- glossary ----
  const gl = $("#glossary");
  gl.append(
    h("h2", { text: "Glossaire des méthodes" }),
    h("p", { class: "desc", text:
      "Les sigles qui reviennent dans les colonnes « méthode » et « évaluation » des référentiels." }),
    tbl(["Sigle", "Signification"], (meta.glossary || []).map((x) => [x.abbr, x.full])),
  );

  // ---- evaluation ----
  const ev = meta.evaluation;
  if (ev) {
    $("#evaluation").append(
      h("h2", { text: ev.title }),
      h("p", { class: "desc", text: ev.note || "" }),
      tbl(["Critère", "Points"], ev.items),
    );
  }

  // ---- about ----
  $("#about").append(
    h("h2", { text: "À propos" }),
    h("p", { class: "desc", html:
      `Cet outil compile <b>${meta.counts.objectives} objectifs</b> répartis sur ` +
      `<b>${meta.counts.services} services</b>, à partir des guides de stage de la ` +
      `${meta.faculty}. Chaque service possède une fiche PDF prête à imprimer, et vous ` +
      `pouvez cocher les objectifs validés — la progression reste sur votre appareil ` +
      `(aucun compte, aucun serveur). Généré le ${meta.generated}.` }),
    h("div", { class: "row", style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:6px" }, [
      h("a", { class: "btn primary", href: "index.html" }, ["Parcourir les services →"]),
    ]),
  );

  function tbl(head, rows) {
    return h("table", { class: "t" }, [
      h("thead", {}, [h("tr", {}, head.map((x) => h("th", { text: x })))]),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", { text: String(c) })))) ),
    ]);
  }
})();
