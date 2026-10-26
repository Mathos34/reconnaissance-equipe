# Site Maison Test

Site statique (HTML, CSS, JavaScript sans framework). Pas de build : les fichiers sont servis tels quels.

## Pages

- `index.html` : reconnaissance en direct, fiche du client reconnu, indicateurs en direct (images et analyses par seconde, temps d'analyse, délai avant reconnaissance, similarité, moteur).
- `clients.html` : consentement « J'ACCEPTE » puis capture guidée (ou import de photos), fiche, enregistrement, export et import.
- `indicateurs.html` : synthèse des mesures enregistrées par ce navigateur, avec graphiques et vue tableau.

## Moteur de calcul

Le moteur se choisit par le paramètre d'URL `moteur` :

| Adresse | Détection | Reconnaissance |
|---|---|---|
| `index.html` (par défaut) | WASM | WASM |
| `index.html?moteur=webgpu` | WebGPU | WebGPU |
| `index.html?moteur=hybride` | WebGPU | WASM |

Le choix par défaut vient des mesures (`docs/DECISIONS.md`, D-037). Un choix fait par l'adresse est mémorisé (clé `localStorage` `maison-test/moteur`) et vaut pour toutes les pages de l'appareil ; `?moteur=wasm` l'efface.

## Données

- Base : clé `localStorage` `maison-test/v1`, contenu `{ version: 1, clients: { [identifiant]: { fiche, gabarit, consentement, creeLe, modifieLe } } }`.
- `gabarit` : 512 nombres (embedding normalisé moyen des 25 images de l'enrôlement), ou `null`. Un gabarit exige un `consentement` `{ date, mention: "J'ACCEPTE" }`.
- Export : `{ format: "maison-test", version: 1, exporteLe, clients: [...] }`. L'import vérifie toute la sauvegarde avant d'écrire.
- Indicateurs : clé `maison-test/indicateurs/v1`, liste des 100 derniers résumés de session (`type: "reconnaissance"` ou `"enrolement"`).

## Paramètres

Les réglages sont dans `js/config.js` : seuil de reconnaissance (`SEUIL`, 0,35), fréquence de détection (`K_DETECTION`, 3), suivi et lissage, critères d'enrôlement, chemins des modèles. La version d'ONNX Runtime Web (1.30.0) est fixée dans la balise `<script>` de `index.html` et `clients.html`.

## Tests

```powershell
npm ci
npm test                  # logique, indicateurs, et parité avec InsightFace si la référence existe
```

La référence de parité et les vidéos de caméra simulée se régénèrent avec `python evaluation/preparer_donnees.py` (dossier `evaluation/donnees/`, non versionné).

Le test de bout en bout (`tests/e2e/test_navigateur.py`) pilote Microsoft Edge avec une caméra simulée : `python tests/e2e/test_navigateur.py`. La variable `MT_URL` permet de le lancer contre le site publié.

## Dépendances

- ONNX Runtime Web 1.30.0, chargé depuis jsDelivr.
- `onnxruntime-node` 1.30.0 et `jpeg-js` pour les tests uniquement (`package.json`).
