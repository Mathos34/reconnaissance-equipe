# Site Maison Test

Site statique (HTML, CSS, JavaScript sans framework). Pas de build : les fichiers sont servis tels quels.

## Données

- Clé `localStorage` : `maison-test/v1`.
- Contenu : `{ version: 1, clients: { [identifiant]: { fiche, gabarit, consentement, creeLe, modifieLe } } }`.
- `gabarit` : tableau de 512 nombres (embedding normalisé moyen des 25 images de l'enrôlement), ou `null`.
- `consentement` : `{ date, mention: "J'ACCEPTE" }`, ou `null`.
- Export : `{ format: "maison-test", version: 1, exporteLe, clients: [...] }`. L'import vérifie chaque fiche avant d'écrire.

## Paramètres

Tous les réglages sont dans `js/config.js` : seuil de reconnaissance (`SEUIL`, 0,35), fréquence de détection (`K_DETECTION`, 3), suivi et lissage, critères d'enrôlement, URLs des modèles et version d'ONNX Runtime Web.

## Tests

```powershell
npm ci
npm test                  # tests de la logique métier (node --test)
```

Le test de parité (`tests/parite.test.mjs`) compare le pipeline JavaScript aux sorties de InsightFace (Python). Il s'active avec les variables `PARITE_IMAGE` et `PARITE_REFERENCE`.

Le test de bout en bout (`tests/e2e/test_navigateur.py`) utilise Microsoft Edge et une caméra simulée. Voir l'en-tête du fichier pour les variables d'environnement.

## Dépendances

- ONNX Runtime Web 1.30.0, chargé depuis jsDelivr (`js/config.js`).
- `onnxruntime-node` 1.30.0 et `jpeg-js` pour les tests uniquement (`package.json`).
