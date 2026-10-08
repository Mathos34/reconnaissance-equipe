# Maison Test : reconnaissance client

Démonstration d'une boutique de luxe fictive, Maison Test. Quand un client se présente devant la caméra, le conseiller voit sa fiche à côté du flux vidéo : préférences, derniers achats, notes, rendez-vous et une suggestion d'accueil adaptée à l'heure.

L'application est un site statique qui tourne entièrement dans le navigateur, sans serveur.

- **Reconnaissance** (`site/index.html`) : flux caméra avec un cadre par visage (nom du client, ou « Inconnu » en gris), fiche du client reconnu, suggestion d'accueil.
- **Clients** (`site/clients.html`) : ajout d'un client en trois étapes (photo, fiche, enregistrement), modification, suppression, export et import de la base.

## Utiliser l'application

1. Ouvrir la page **Clients**.
2. Étape 1 : cliquer sur **Activer la caméra**. Regarder la caméra, les cinq poses s'enchaînent (face, gauche, droite, haut, bas). La capture s'arrête après 25 images valides. On peut aussi importer des photos.
3. Étape 2 : remplir la fiche (identité, préférences, repères, derniers achats, notes, rendez-vous).
4. Étape 3 : taper **J'ACCEPTE** pour confirmer le consentement, puis **Enregistrer le client**.
5. Ouvrir la page **Reconnaissance**, cliquer sur **Démarrer la caméra**. Le client enregistré est reconnu et sa fiche s'affiche.

La base est stockée dans le navigateur de l'appareil. **Exporter** produit un fichier JSON, **Importer** le recharge sur un autre navigateur ou un autre appareil.

## Publier sur GitHub Pages

Le dossier `site/` est publié par le workflow `.github/workflows/pages.yml` à chaque push sur `main`.

Pour activer la publication : dans les réglages du dépôt, rubrique **Pages**, choisir **GitHub Actions** comme source. Sur un dépôt privé, GitHub Pages demande un compte GitHub Pro, Team ou Enterprise.

Le dossier `site/models/` contient les deux modèles de visage (`det_500m.onnx` et `w600k_mbf.onnx`). Il n'est pas versionné dans l'état actuel, voir [docs/DECISIONS.md](docs/DECISIONS.md), D-033.

## Architecture de la version web

```
site/
  index.html, clients.html   pages
  css/app.css
  js/config.js               seuils, paramètres, URLs
  js/coeur/                  logique pure : suivi, lissage, suggestion, validation, base, enrôlement
  js/navigateur/             caméra, moteur ONNX Runtime Web, stockage
  js/pages/                  scripts des deux pages
  models/                    modèles de visage (non versionnés, voir D-033)
  tests/                     tests Node (logique, parité avec InsightFace) et test de bout en bout
```

- La détection (SCRFD `det_500m`) et la reconnaissance (`w600k_mbf`) tournent avec ONNX Runtime Web, en WebGPU si disponible, sinon en WASM.
- Le pipeline est identique à la version Python : détection une image sur K, suivi par IoU, reconnaissance par similarité cosinus (seuil 0,35), lissage 3 sur 5.
- Les images ne sont jamais écrites sur le disque et ne sont envoyées à aucun service.

Détails : [site/README.md](site/README.md).

## Tests

```powershell
cd site
npm ci
npm test                                  # logique métier, 34 tests
$env:PARITE_IMAGE = "chemin\image.jpg"    # facultatif : parité avec InsightFace
$env:PARITE_REFERENCE = "chemin\ref.json"
node --test tests/parite.test.mjs
```

Le test de bout en bout pilote Microsoft Edge avec une caméra simulée. Il a besoin de deux vidéos YUV4MPEG2, non versionnées : voir l'en-tête de [site/tests/e2e/test_navigateur.py](site/tests/e2e/test_navigateur.py).

```powershell
python site\tests\e2e\test_navigateur.py
```

## Version Python locale (archive)

La première version tourne en local avec une fenêtre web sur `localhost` et InsightFace côté serveur. Elle reste utile pour l'évaluation hors ligne et les benchmarks.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH = "src"
python -m boutique.backend --modele buffalo_s --telecharger   # poids, environ 159 Mo
python -m boutique.server                                     # http://localhost:8000
python -m boutique.enroll --client C001                       # enrôlement
python -m boutique.bench --modele buffalo_s                   # fps
python -m pytest                                              # 88 tests
```

Détails : [src/boutique/README.md](src/boutique/README.md), [notebook d'évaluation](notebooks/01_reconnaissance_equipe.ipynb).

## Documents

- [Journal des décisions](docs/DECISIONS.md)
- [Rapport d'avancement](docs/RAPPORT.md)
- [Benchmark](docs/BENCH.md)
- [Procédure des fiches de démonstration](demo/PROCEDURE.md)
