#!/usr/bin/env python3
"""Build the Externat dataset and the per-service PDF cheatsheets.

Outputs
-------
  data/objectives.js     window.OBJECTIVES = {...}  (loaded by the site)
  data/objectives.json   same payload, for tooling / re-use
  pdfs/services/<slug>.pdf   one validation checklist per service
  pdfs/services/tous-les-objectifs.pdf   the whole guide in one file
"""
import json
import datetime as dt
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

import parse_old

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PDFDIR = ROOT / "pdfs" / "services"
FONT_DIR = "/usr/share/fonts/truetype/dejavu"

FACULTY = "Faculté de Médecine et de Pharmacie de Marrakech"
UNIVERSITY = "Université Cadi Ayyad"
TODAY = dt.date.today().isoformat()

# Order in which specialty groups are presented across the whole app.
GROUP_ORDER = [
    "Immersion & bases", "Médecine", "Chirurgie", "Pédiatrie & enfant",
    "Réanimation & urgences", "Laboratoires", "Santé publique",
]

# Curated learning aids distilled from both guides (high cheatsheet value).
GLOSSARY = [
    ("ARC", "Apprentissage du Raisonnement Clinique"),
    ("APC", "Apprentissage Par Concordance (scripts de concordance)"),
    ("ECOS", "Examen Clinique Objectif Structuré"),
    ("TCS", "Test de Concordance de Script"),
    ("SNAPS", "Modèle de supervision clinique (Summarize, Narrow, Analyse, Probe, Plan, Select)"),
    ("FpC / FPC", "Formation Par Compétences"),
    ("Patient simulé", "Acteur formé jouant un rôle clinique standardisé"),
    ("Mise en situation", "Évaluation en conditions réelles ou simulées"),
]

EVALUATION = {
    "title": "Évaluation des stages d'immersion",
    "note": "Barème indicatif (Édition 2022).",
    "items": [
        ["Présence", "20 pts"],
        ["Assiduité / participation", "20 pts"],
        ["Validation des objectifs", "40 pts"],
        ["Rapport de fin de stage", "40 pts"],
        ["Note finale", "120 pts"],
    ],
}

SOURCES = [
    {"id": "detaille",
     "name": "Guide détaillé — checklist de validation",
     "desc": "Objectifs par service avec colonnes Date / Validation. Source des fiches.",
     "file": "pdfs/full/guide-detaille-checklist.pdf", "pages": 75},
    {"id": "ref2022",
     "name": "Référentiel des objectifs — Édition 2022",
     "desc": "Objectifs avec méthodes d'enseignement et d'évaluation (ARC, ECOS…).",
     "file": "pdfs/full/guide-objectifs-2022.pdf", "pages": 35},
]


# ----------------------------------------------------------------- PDF
INK = (33, 37, 41)
MUTED = (108, 117, 125)
ACCENT = (13, 110, 96)        # teal
ACCENT_SOFT = (224, 242, 238)
LINE = (210, 214, 218)
ZEBRA = (247, 249, 250)


class ServicePDF(FPDF):
    def __init__(self, service):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.service = service
        self.set_auto_page_break(True, margin=16)
        self.set_margins(15, 14, 15)
        self.add_font("DejaVu", "", f"{FONT_DIR}/DejaVuSans.ttf")
        self.add_font("DejaVu", "B", f"{FONT_DIR}/DejaVuSans-Bold.ttf")
        self.set_title(f"Objectifs de stage — {service['name']}")

    def header(self):
        self.set_font("DejaVu", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 4, f"{FACULTY}  ·  {UNIVERSITY}",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if self.page_no() == 1:
            self.ln(2)
            # accent title block
            self.set_fill_color(*ACCENT)
            y = self.get_y()
            self.set_font("DejaVu", "B", 16)
            self.set_text_color(255, 255, 255)
            self.set_fill_color(*ACCENT)
            self.multi_cell(0, 10, f"  {self.service['name']}", fill=True,
                            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_font("DejaVu", "", 8.5)
            self.set_text_color(*MUTED)
            yrs = self.service.get("years") or []
            meta = "Objectifs de stage hospitalier — checklist de validation"
            if yrs:
                meta += "   ·   " + ", ".join(f"{y}ᵉ année" for y in yrs)
            meta += f"   ·   {self.service['count']} objectifs"
            self.ln(1)
            self.cell(0, 5, meta, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(1)
        else:
            self.ln(1)

    def footer(self):
        self.set_y(-13)
        self.set_draw_color(*LINE)
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(1)
        self.set_font("DejaVu", "", 7)
        self.set_text_color(*MUTED)
        self.cell(0, 4,
                  f"externat · second brain des objectifs de stage   ·   "
                  f"généré le {TODAY}", align="L")
        self.cell(0, 4, f"page {self.page_no()}", align="R",
                  new_x=XPos.RIGHT, new_y=YPos.TOP)

    def group_title(self, label):
        if not label:
            return
        self.ln(1.5)
        if self.get_y() > 250:
            self.add_page()
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(*ACCENT)
        self.set_fill_color(*ACCENT_SOFT)
        self.cell(0, 7, f"  {label}", fill=True,
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT, border=0)
        self.ln(1)

    def objectives_table(self, objectives, start_index=1):
        # columns: number | objective | date | validation
        w_num, w_date, w_val = 9, 26, 26
        w_obj = 180 - w_num - w_date - w_val
        self.set_font("DejaVu", "B", 8)
        self.set_text_color(*MUTED)
        self.set_draw_color(*LINE)
        self.set_fill_color(255, 255, 255)
        # header row
        self.cell(w_num, 6, "", border="B")
        self.cell(w_obj, 6, "  Objectif", border="B")
        self.cell(w_date, 6, "Date", border="B", align="C")
        self.cell(w_val, 6, "Validation", border="B", align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 9)
        self.set_text_color(*INK)
        i = start_index
        for obj in objectives:
            # measure wrapped height
            self.set_font("DejaVu", "", 9)
            lines = self.multi_cell(w_obj, 5, obj, dry_run=True, output="LINES",
                                    new_x=XPos.RIGHT, new_y=YPos.TOP)
            h = max(8, 5 * len(lines) + 3)
            if self.get_y() + h > self.page_break_trigger:
                self.add_page()
            zebra = (i % 2 == 0)
            if zebra:
                self.set_fill_color(*ZEBRA)
            x0, y0 = self.get_x(), self.get_y()
            # number
            self.set_text_color(*MUTED)
            self.set_font("DejaVu", "", 8)
            self.cell(w_num, h, str(i), border=0, align="C", fill=zebra)
            # objective (wrapped)
            self.set_text_color(*INK)
            self.set_font("DejaVu", "", 9)
            self.set_xy(x0 + w_num, y0)
            self.multi_cell(w_obj, 5, obj, border=0, fill=zebra,
                            new_x=XPos.RIGHT, new_y=YPos.TOP,
                            max_line_height=5, padding=(1.5, 1, 0, 1))
            # date + validation empty boxes
            self.set_xy(x0 + w_num + w_obj, y0)
            self.cell(w_date, h, "", border=0, fill=zebra)
            self.cell(w_val, h, "", border=0, fill=zebra,
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            # bottom hairline
            self.set_draw_color(*LINE)
            self.line(x0, y0 + h, x0 + 180, y0 + h)
            self.set_y(y0 + h)
            i += 1
        return i


def build_service_pdf(service, out_path):
    pdf = ServicePDF(service)
    pdf.add_page()
    idx = 1
    for g in service["groups"]:
        pdf.group_title(g["label"])
        idx = pdf.objectives_table(g["objectives"], start_index=idx)
    pdf.output(str(out_path))


def build_full_pdf(services, out_path):
    """One big document: cover + every service."""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(True, margin=16)
    pdf.set_margins(15, 14, 15)
    pdf.add_font("DejaVu", "", f"{FONT_DIR}/DejaVuSans.ttf")
    pdf.add_font("DejaVu", "B", f"{FONT_DIR}/DejaVuSans-Bold.ttf")
    pdf.set_title("Tous les objectifs de stage")
    # simple cover
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font("DejaVu", "B", 26)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 12, "Objectifs des stages hospitaliers",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.set_font("DejaVu", "", 12)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(0, 7, f"{FACULTY}\n{UNIVERSITY}",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(4)
    n_obj = sum(s["count"] for s in services)
    pdf.multi_cell(0, 7, f"{len(services)} services · {n_obj} objectifs · "
                   f"checklist de validation\ngénéré le {TODAY}",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")

    for s in services:
        sp = ServicePDF(s)
        # reuse ServicePDF rendering by drawing into this doc is non-trivial;
        # instead append a fresh page with the same look.
        pdf.add_page()
        pdf.set_font("DejaVu", "B", 15)
        pdf.set_text_color(*ACCENT)
        pdf.set_fill_color(*ACCENT_SOFT)
        pdf.cell(0, 9, f"  {s['name']}", fill=True,
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("DejaVu", "", 8.5)
        pdf.set_text_color(*MUTED)
        yrs = ", ".join(f"{y}ᵉ année" for y in (s.get("years") or []))
        pdf.cell(0, 6, f"{s['group']}" + (f"  ·  {yrs}" if yrs else "") +
                 f"  ·  {s['count']} objectifs",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1)
        i = 1
        for g in s["groups"]:
            if g["label"]:
                pdf.ln(1)
                pdf.set_font("DejaVu", "B", 10)
                pdf.set_text_color(*ACCENT)
                pdf.cell(0, 6, g["label"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("DejaVu", "", 9.5)
            pdf.set_text_color(*INK)
            for obj in g["objectives"]:
                if pdf.get_y() > pdf.page_break_trigger - 12:
                    pdf.add_page()
                x0, y0 = pdf.get_x(), pdf.get_y()
                pdf.set_text_color(*ACCENT)
                pdf.set_font("DejaVu", "B", 9.5)
                pdf.cell(7, 5.5, "□")
                pdf.set_text_color(*INK)
                pdf.set_font("DejaVu", "", 9.5)
                pdf.multi_cell(168, 5.5, obj, new_x=XPos.LMARGIN,
                               new_y=YPos.NEXT, max_line_height=5.5)
                i += 1
    pdf.output(str(out_path))


# ----------------------------------------------------------------- data
def build_payload(modules):
    services = []
    for m in sorted(modules, key=lambda x: (GROUP_ORDER.index(x["group"])
                                            if x["group"] in GROUP_ORDER else 99,
                                            x["name"])):
        services.append({
            "slug": m["slug"],
            "name": m["name"],
            "icon": m["icon"],
            "group": m["group"],
            "section": m["section"],
            "years": m["years"],
            "count": m["count"],
            "pdf": f"pdfs/services/{m['slug']}.pdf",
            "groups": [{"label": g["label"], "objectives": g["objectives"]}
                       for g in m["groups"]],
        })
    payload = {
        "meta": {
            "app": "externat",
            "tagline": "Le second brain des objectifs de stage hospitalier",
            "faculty": FACULTY,
            "university": UNIVERSITY,
            "generated": TODAY,
            "counts": {
                "services": len(services),
                "objectives": sum(s["count"] for s in services),
                "groups": len(set(s["group"] for s in services)),
            },
            "groupOrder": GROUP_ORDER,
            "glossary": [{"abbr": a, "full": f} for a, f in GLOSSARY],
            "evaluation": EVALUATION,
            "sources": SOURCES,
            "fullPdf": "pdfs/services/tous-les-objectifs.pdf",
        },
        "services": services,
    }
    return payload


def main():
    modules = parse_old.parse()
    payload = build_payload(modules)

    DATA.mkdir(exist_ok=True, parents=True)
    PDFDIR.mkdir(exist_ok=True, parents=True)

    (DATA / "objectives.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2))
    (DATA / "objectives.js").write_text(
        "/* Generated by build/build.py — do not edit by hand. */\n"
        "window.OBJECTIVES = " +
        json.dumps(payload, ensure_ascii=False) + ";\n")

    for s in payload["services"]:
        build_service_pdf(s, PDFDIR / f"{s['slug']}.pdf")
    build_full_pdf(payload["services"], PDFDIR / "tous-les-objectifs.pdf")

    print(f"✓ data: {payload['meta']['counts']}")
    print(f"✓ pdfs: {len(payload['services'])} services + 1 combined")


if __name__ == "__main__":
    main()
