# externat — le second brain des objectifs de stage

Guide digital pour les externes, par un ancien externe.

Un site **statique** (zéro dépendance, zéro serveur) qui rassemble **tous les
objectifs des stages hospitaliers** de la Faculté de Médecine et de Pharmacie de
Marrakech, rangés **par service**. Pensé façon *cheat-sheet* pour compresser
l'apprentissage et garder une trace de ce qui est validé.

> **44 services · 918 objectifs · 7 pôles** — recherche instantanée, suivi de
> validation (coché = retenu) et **fiche PDF téléchargeable pour chaque module**.

## Ce que ça fait

- 🔎 **Recherche instantanée** sur les services *et* le texte des objectifs
  (« ECG », « ponction lombaire », « ictère »…), avec **extraits surlignés**
  directement sur les cartes. Raccourci : `/`.
- 🧩 **Filtres** par pôle (Médecine, Chirurgie, Pédiatrie…) et par année.
  L'état (recherche + filtres) est **inscrit dans l'URL** — une vue se partage
  telle quelle.
- ♿ **Accessible au clavier** : chaque objectif est une case à cocher
  (Espace / Entrée), et chaque fiche a son propre champ de filtre.
- ✅ **Suivi de validation** : cochez un objectif, la progression est gardée
  sur votre appareil (`localStorage`, aucun compte). Barre de progression par
  service et globale.
- 📄 **Téléchargement PDF par service** : une fiche checklist prête à imprimer
  (colonnes *Date / Validation*) pour chaque module — plus une fiche unique qui
  rassemble tout.
- 📚 **Page Guides** : les deux référentiels d'origine consultables et
  téléchargeables, le glossaire des méthodes (ARC, ECOS, TCS, SNAPS…) et le
  barème d'évaluation.
- 🌙 Thème clair / sombre, responsive, **fonctionne hors-ligne**.

## Structure

```
index.html            Tableau de bord (recherche, filtres, grille des services)
service.html?slug=…   Fiche d'un service (objectifs + checklist + PDF)
guides.html           Guides complets, glossaire, barème
assets/css/style.css  Thème (clair/sombre)
assets/js/            store.js (données + thème + progression) · home/service/guides.js
data/objectives.json  Données structurées (44 services, 918 objectifs)
data/objectives.js    Même contenu, injecté via window.OBJECTIVES (offline)
pdfs/services/*.pdf    Une fiche par service + « tous-les-objectifs.pdf »
pdfs/full/*.pdf        Les deux guides d'origine (référentiel 2022 + checklist détaillée)
build/                Scripts de génération (voir ci-dessous)
```

## Mettre en ligne (GitHub Pages)

Deux options, au choix :

1. **Branche** *(le plus simple)* — Settings → **Pages** → *Deploy from a branch*
   → choisir la branche et le dossier **`/ (root)`**. Le fichier `.nojekyll`
   garantit que les dossiers commençant par `_` ne sont pas ignorés.
2. **GitHub Actions** — Settings → **Pages** → *Source : GitHub Actions*. Le
   workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publie
   automatiquement à chaque push sur `main`.

Tous les chemins sont **relatifs** : le site marche aussi bien à la racine d'un
domaine que sous `https://<user>.github.io/externat/`.

## Régénérer les données et les PDF

Les données et les fiches PDF sont générées à partir du guide détaillé
(`build/sources/guide_old.docx`).

```bash
pip install python-docx fpdf2          # dépendances de build
cd build && python build.py            # réécrit data/ et pdfs/services/
```

`build/build.py` analyse le document, écrit `data/objectives.{js,json}` puis
produit une fiche PDF par service (police Unicode DejaVu, mise en page checklist
avec colonnes *Date / Validation*) ainsi que la fiche combinée.

## Données

Compilé à partir des guides de stage hospitalier de la **FMPM – Université Cadi
Ayyad**. Contenu pédagogique fourni à titre de support de révision ; en cas de
doute, se référer aux référentiels officiels (disponibles sur la page *Guides*).
