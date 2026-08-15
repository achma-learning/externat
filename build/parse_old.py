#!/usr/bin/env python3
"""Parse the detailed checklist guide (guide_old.docx) into structured modules.

The document is a sequence of headings (A- .. I- sections) and tables.
Each table holds one or more "services", each made of objective rows with
empty DATE / VALIDATION columns (a validation checklist).
"""
import re
import json
import unicodedata
from pathlib import Path

import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

HERE = Path(__file__).resolve().parent
SRC = HERE / "sources" / "guide_old.docx"

# ---------------------------------------------------------------- cleaning
FIXES = {
    "EËfectuer": "Effectuer",
    "EÌfectuer": "Effectuer",
    "à risqué": "à risque",
    "du risqué": "du risque",
    "risqué cardio": "risque cardio",
    "antéhypophysaire": "antéhypophysaire",
    "intracrâanienne": "intracrânienne",
    "contres indications": "contre-indications",
    "contre indications": "contre-indications",
    "Reconnaiître": "Reconnaître",
    "les lesions": "les lésions",
}

# A handful of cells in the source .docx store their text runs out of order,
# producing scrambled objectives. Every word is present, so these are faithful
# re-orderings keyed by the exact (post-clean) garbled string.
CORRECTIONS = {
    "sthétacoustiques Décrire les caractéristiques d’un soufflé cardiaque retrouvé chez un patient porteur d’une insuffisance aortique.":
        "Décrire les caractéristiques stéthacoustiques d’un souffle cardiaque retrouvé chez un patient porteur d’une insuffisance aortique.",
    "cardiaque chez Décrire un l’aspect patient sur une des porteur radiographie arcs d’une de la silhouette valvulopathie thoracique de mitrale au stade chirurgicale":
        "Décrire l’aspect des arcs de la silhouette cardiaque sur une radiographie thoracique chez un patient porteur d’une valvulopathie mitrale au stade chirurgical.",
    "chez Reconnaître un malade les signes en détresse de gravité respiratoire d’une insuffisance en réanimation respiratoire aiguë":
        "Reconnaître les signes de gravité d’une insuffisance respiratoire aiguë chez un malade en réanimation.",
    "en Réaliser réanimation un bilan hydrique entrées/sorties des 24H chez un patient":
        "Réaliser en réanimation un bilan hydrique (entrées/sorties) des 24H chez un patient.",
    "élémentaire Reconnaître d’un sur la malade gazométrie en réanimation artérielle un désordre acido-basique":
        "Reconnaître un désordre acido-basique élémentaire sur la gazométrie artérielle chez un malade en réanimation.",
}


def clean(text: str) -> str:
    if text is None:
        return ""
    t = text.replace("\xa0", " ")
    # rows extracted with newline -> " / "; turn hard hyphenation back to words
    t = t.replace(" / ", " ").replace("/ ", " ").replace("\n", " ")
    for a, b in FIXES.items():
        t = t.replace(a, b)
    # join words split by hyphen at line break: "immunisa- tion" -> "immunisation"
    t = re.sub(r"(\w)-\s+(\w)", lambda m: m.group(1) + m.group(2)
               if m.group(0)[0].islower() else m.group(0), t)
    t = re.sub(r"\s+", " ", t).strip()
    # trailing orphan letters like "norma" -> leave; fix common ones
    t = re.sub(r"\bnorma\b", "normal", t)
    # drop a leaked sub-header prefix and stray trailing punctuation
    t = re.sub(r"^S[ée]ances d[’']ARC\s*:\s*", "", t)
    t = re.sub(r"[ ,;]+$", "", t)
    return t


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


# ---------------------------------------------------------------- doc walk
def iter_blocks(doc):
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


SECTION_RE = re.compile(r"^([A-I])-\s+(.*)", re.S)

# A row is a "title / banner" when every column holds the same text (a cell
# merged across the whole width). An objective row instead leaves the DATE /
# VALIDATION columns empty, so `all(cells)` is False for it.
def row_cells(row):
    return [clean(c.text) for c in row.cells]


def is_banner(cells):
    return len(cells) >= 2 and all(cells) and len(set(cells)) == 1


# Section banners that are not themselves a service (the real service follows).
SKIP_BANNERS = {"services de l'enfant", "services de lenfant"}


HEADER_WORDS = {"objectifs du stage", "objectif du stage", "objectif",
                "date", "validation", "objectifs", "taches"}


def is_header_row(cells):
    low = [c.lower() for c in cells if c]
    if not low:
        return False
    return all(any(w == c or c in HEADER_WORDS for w in HEADER_WORDS) or
               c in ("date", "validation") for c in low) and \
        any("objectif" in c or c in ("date", "validation") for c in low)


# Detect a row that starts a *service* (vs. a thematic sub-group label)
SERVICE_HINTS = ("service de", "service d", "service des", "stage d",
                 "stage fondament", "chirurgie vasculaire", "centre de sante",
                 "radiologie pediatrique", "neonatologie", "pediatrie",
                 "chirurgie pediatrique", "reanimation pediatrique")


def is_service_title(text):
    # Every real service banner in the document starts with one of these hints.
    # Thematic sub-group banners (SÉANCES D'ARC, Thèmes…, Diabétologie…) do not,
    # so we deliberately avoid a generic "all uppercase" rule.
    n = strip_accents(text).lower().strip()
    return any(n.startswith(h) for h in SERVICE_HINTS)


# Method / evaluation tokens that sometimes leak into an objective cell.
NOISE = {"arc", "apc", "ecos", "ecosl", "snaps", "simulation", "jeux de role",
         "jeu de role", "patient reel", "patient simule", "date", "validation"}


def is_noise(text):
    n = strip_accents(text).lower().strip(" .:-")
    if n in NOISE or len(n) < 6:
        return True
    # a single all-caps word (e.g. "GESTES") is a sub-header, not an objective
    if text.strip().isupper() and " " not in text.strip():
        return True
    return False


def split_objective(cells):
    """Return (rubrique, objective) for a data row.

    Wide tables come in two flavours: the objective is either duplicated across
    columns 0-1 (merged cell) or column 0 carries a *rubrique* label while the
    real objective sits in column 1.
    """
    if len(cells) >= 4:
        a, b = cells[0], cells[1]
        if a and b and a != b:
            return a, b           # col0 = rubrique, col1 = objective
        if a and b and a == b:
            return None, a        # objective merged across both columns
        if b and not a:
            return None, b
        return None, a
    # 3-column table: objective in the first non-empty cell
    return None, (cells[0] if cells[0] else next((c for c in cells if c), ""))


YEAR_RE = re.compile(r"(\d)\s*[èeé]?me\s*ann[ée]e", re.I)


def extract_years(text):
    return sorted(set(YEAR_RE.findall(text)))


# ---------------------------------------------------------------- canonical
# slug -> (display, icon, group)
CANON = {
    "immersion": ("Stage d'immersion", "🏥", "Immersion & bases"),
    "semiologie-soins": ("Sémiologie & soins infirmiers", "🩺", "Immersion & bases"),
    "fondamental-medecine": ("Stage fondamental de Médecine", "📋", "Immersion & bases"),
    "fondamental-chirurgie": ("Stage fondamental de Chirurgie", "🔪", "Immersion & bases"),
    "rhumatologie": ("Rhumatologie", "🦴", "Médecine"),
    "cardiologie": ("Cardiologie", "🫀", "Médecine"),
    "dermatologie": ("Dermatologie", "🧴", "Médecine"),
    "endocrinologie": ("Endocrinologie & maladies métaboliques", "🩸", "Médecine"),
    "gastro-enterologie": ("Gastro-entérologie", "🩻", "Médecine"),
    "hematologie-clinique": ("Hématologie clinique", "🧫", "Médecine"),
    "medecine-interne": ("Médecine interne", "🩺", "Médecine"),
    "maladies-infectieuses": ("Maladies infectieuses", "🦠", "Médecine"),
    "nephrologie": ("Néphrologie", "🫘", "Médecine"),
    "neurologie": ("Neurologie", "🧠", "Médecine"),
    "pneumophtisiologie": ("Pneumophtisiologie", "🫁", "Médecine"),
    "psychiatrie": ("Psychiatrie", "🧩", "Médecine"),
    "reeducation": ("Médecine physique & réadaptation", "🦽", "Médecine"),
    "radiotherapie-oncologie": ("Radiothérapie-oncologie", "☢️", "Médecine"),
    "radiologie": ("Radiologie", "🩻", "Médecine"),
    "chirurgie-cardiovasculaire": ("Chirurgie cardiovasculaire", "❤️", "Chirurgie"),
    "chirurgie-vasculaire": ("Chirurgie vasculaire périphérique", "🩸", "Chirurgie"),
    "chirurgie-viscerale": ("Chirurgie viscérale", "🔪", "Chirurgie"),
    "traumatologie": ("Traumatologie-orthopédie", "🦴", "Chirurgie"),
    "neurochirurgie": ("Neurochirurgie", "🧠", "Chirurgie"),
    "orl": ("ORL", "👂", "Chirurgie"),
    "ophtalmologie": ("Ophtalmologie", "👁️", "Chirurgie"),
    "urologie": ("Urologie", "🚹", "Chirurgie"),
    "maxillo-faciale": ("Stomatologie & chirurgie maxillo-faciale", "🦷", "Chirurgie"),
    "chirurgie-plastique": ("Chirurgie plastique", "✂️", "Chirurgie"),
    "gynecologie-obstetrique": ("Gynécologie-obstétrique", "🤰", "Chirurgie"),
    "neonatologie": ("Néonatologie", "👶", "Pédiatrie & enfant"),
    "pediatrie": ("Pédiatrie", "🧒", "Pédiatrie & enfant"),
    "chirurgie-pediatrique": ("Chirurgie pédiatrique", "🧸", "Pédiatrie & enfant"),
    "radiologie-pediatrique": ("Radiologie pédiatrique", "🩻", "Pédiatrie & enfant"),
    "reanimation-pediatrique": ("Réanimation pédiatrique", "🍼", "Pédiatrie & enfant"),
    "reanimation-anesthesie": ("Réanimation & anesthésie", "🫁", "Réanimation & urgences"),
    "parasitologie": ("Parasitologie-mycologie", "🦟", "Laboratoires"),
    "microbiologie": ("Microbiologie", "🧫", "Laboratoires"),
    "anatomie-pathologique": ("Anatomie pathologique", "🔬", "Laboratoires"),
    "immunologie": ("Immunologie", "🧪", "Laboratoires"),
    "genetique": ("Génétique", "🧬", "Laboratoires"),
    "biochimie": ("Biochimie", "⚗️", "Laboratoires"),
    "hematologie-labo": ("Hématologie (laboratoire)", "🩸", "Laboratoires"),
    "centre-sante": ("Centre de santé – Médecine de famille", "🏘️", "Santé publique"),
}

# match raw uppercase title -> slug, by keyword (order matters)
KEYMAP = [
    ("immersion", "immersion"),
    ("semiologie", "semiologie-soins"),
    ("fondamental de medecine", "fondamental-medecine"),
    ("fondamentale de medecine", "fondamental-medecine"),
    ("fondamental de chirurgie", "fondamental-chirurgie"),
    ("rhumatolog", "rhumatologie"),
    ("cardiolog", "cardiologie"),
    ("dermatolog", "dermatologie"),
    ("endocrinolog", "endocrinologie"),
    ("gastro", "gastro-enterologie"),
    ("hematologie clinique", "hematologie-clinique"),
    ("medecine interne", "medecine-interne"),
    ("maladies infectieuses", "maladies-infectieuses"),
    ("nephrolog", "nephrologie"),
    ("neurolog", "neurologie"),
    ("pneumo", "pneumophtisiologie"),
    ("psychiatr", "psychiatrie"),
    ("physique et readaptation", "reeducation"),
    ("readaptation", "reeducation"),
    ("radiotherapie", "radiotherapie-oncologie"),
    ("chirurgie cardiovasculaire", "chirurgie-cardiovasculaire"),
    ("chirurgie vasculaire", "chirurgie-vasculaire"),
    ("vasculaire peripherique", "chirurgie-vasculaire"),
    ("chirurgie viscerale", "chirurgie-viscerale"),
    ("traumatologie", "traumatologie"),
    ("neurochirurgie", "neurochirurgie"),
    ("orl", "orl"),
    ("ophtalmolog", "ophtalmologie"),
    ("urologie", "urologie"),
    ("maxillo", "maxillo-faciale"),
    ("stomatologie", "maxillo-faciale"),
    ("chirurgie plastique", "chirurgie-plastique"),
    ("gynecologie", "gynecologie-obstetrique"),
    ("neonatolog", "neonatologie"),
    ("radiologie pediatrique", "radiologie-pediatrique"),
    ("chirurgie pediatrique", "chirurgie-pediatrique"),
    ("reanimation pediatrique", "reanimation-pediatrique"),
    ("pediatrie", "pediatrie"),
    ("reanimation anesthesie", "reanimation-anesthesie"),
    ("reanimation", "reanimation-anesthesie"),
    ("parasitolog", "parasitologie"),
    ("microbiolog", "microbiologie"),
    ("anatomo", "anatomie-pathologique"),
    ("immunolog", "immunologie"),
    ("genetique", "genetique"),
    ("biochimie", "biochimie"),
    ("hematologie", "hematologie-labo"),
    ("centre de sante", "centre-sante"),
    ("radiologie", "radiologie"),
]


def title_to_slug(title):
    n = strip_accents(title).lower()
    for key, slug in KEYMAP:
        if key in n:
            return slug
    return None


def parse():
    doc = docx.Document(str(SRC))
    modules = {}          # slug -> module dict
    order = []            # slug order of first appearance
    section = None
    current = None        # current module being filled
    current_group = None  # current sub-group label

    def get_module(slug, raw_title, years):
        if slug not in modules:
            disp, icon, group = CANON.get(slug, (raw_title.title(), "📄", "Autres"))
            modules[slug] = {
                "slug": slug, "name": disp, "icon": icon, "group": group,
                "section": section, "years": list(years),
                "raw_titles": [raw_title], "groups": [],
            }
            order.append(slug)
        else:
            m = modules[slug]
            for y in years:
                if y not in m["years"]:
                    m["years"].append(y)
            if raw_title not in m["raw_titles"]:
                m["raw_titles"].append(raw_title)
        return modules[slug]

    def add_group(module, label):
        grp = {"label": label, "objectives": []}
        module["groups"].append(grp)
        return grp

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            txt = clean(block.text)
            m = SECTION_RE.match(txt)
            if m:
                section = m.group(2).strip()
            continue

        # ---- a table
        for row in block.rows:
            cells = row_cells(row)
            if not any(cells):
                continue
            banner = is_banner(cells)
            text = next((c for c in cells if c), "")

            if is_header_row(cells):
                continue

            if banner and strip_accents(text).lower() in SKIP_BANNERS:
                continue

            if banner:
                if is_service_title(text):
                    slug = title_to_slug(text)
                    if slug is None:
                        # unknown service: make slug from title
                        slug = re.sub(r"[^a-z0-9]+", "-",
                                      strip_accents(text).lower()).strip("-")[:40]
                    years = extract_years(text)
                    current = get_module(slug, text, years)
                    # default group label from year if present
                    lbl = None
                    if years:
                        lbl = " / ".join(f"{y}ème année" for y in years)
                    current_group = add_group(current, lbl)
                else:
                    # thematic sub-group within current service
                    if current is None:
                        continue
                    current_group = add_group(current, text)
                continue

            # ---- objective row
            if current is None:
                continue
            rubrique, obj = split_objective(cells)
            obj = clean(obj)
            obj = CORRECTIONS.get(obj, obj)
            if not obj or obj.lower() in HEADER_WORDS or is_noise(obj):
                continue
            if rubrique:
                rubrique = clean(rubrique).rstrip(" :")
                if rubrique and not is_noise(rubrique) or rubrique.upper() in ("ARC", "APC"):
                    if current_group is None or current_group["label"] != rubrique:
                        current_group = add_group(current, rubrique)
            if current_group is None:
                current_group = add_group(current, None)
            current_group["objectives"].append(obj)

    # finalize: drop empty groups, compute counts
    out = []
    for slug in order:
        m = modules[slug]
        m["groups"] = [g for g in m["groups"] if g["objectives"]]
        m["count"] = sum(len(g["objectives"]) for g in m["groups"])
        m["years"] = sorted(m["years"])
        if m["count"]:
            out.append(m)

    return out


def main():
    out = parse()
    Path(HERE / "_old_modules.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"services: {len(out)}, objectives: {sum(m['count'] for m in out)}")
    for m in out:
        yrs = ("y" + ",".join(m["years"])) if m["years"] else ""
        print(f"  {m['slug']:28} {m['count']:3}  {yrs:8} [{m['group']}] "
              f"{len(m['groups'])}grp")


if __name__ == "__main__":
    main()
