# Maison Test : reconnaissance client

Démonstration d'une boutique de luxe fictive, Maison Test. Quand un client se présente devant la caméra, le conseiller voit sa fiche à côté du flux vidéo : préférences, derniers achats, notes, rendez-vous et une suggestion d'accueil adaptée à l'heure.

L'application est un site statique qui tourne entièrement dans le navigateur, sans serveur : **[mathos34.github.io/reconnaissance-equipe](https://mathos34.github.io/reconnaissance-equipe/)**.

- **Reconnaissance** (`site/index.html`) : flux caméra avec un cadre par visage (nom du client, ou « Inconnu » en gris), fiche du client reconnu, suggestion d'accueil, indicateurs en direct.
- **Clients** (`site/clients.html`) : ajout d'un client en trois étapes (consentement et photo, fiche, vérification), modification, suppression, export et import de la base.
- **Indicateurs** (`site/indicateurs.html`) : vitesse, temps par étape, délai de reconnaissance, similarités et enrôlements, mesurés par l'application elle-même.

## Chiffres clés

Mesurés dans Edge sur un Ryzen 7 5800H avec RTX 3060 (`evaluation/`, détails dans [docs/DECISIONS.md](docs/DECISIONS.md), D-037 et D-040).

| Indicateur | Valeur |
|---|---|
| Délai entre l'apparition du visage et la fiche (médiane) | 0,34 s par défaut, 0,20 s en mode hybride |
| Temps d'une analyse (détection et reconnaissance) | 132 ms par défaut, 108 ms en mode hybride |
| Enrôlement d'un client (25 images valides) | 18,7 s |
| Fausses acceptations au seuil 0,35 | 0 % (6 identités, conditions dégradées) |
| Distance d'identification à 100 % | environ 2 m |
| Écart avec la version Python (InsightFace) | 0,17 px sur les visages, similarité 0,9985 |

L'évaluation de robustesse est indicative : 6 identités, une seule photo source par personne, perturbations synthétiques.

## Utiliser l'application

1. Ouvrir la page **Clients**, cliquer sur **Nouveau**.
2. Étape 1 : la personne tape **J'ACCEPTE**. La caméra et l'import de photos ne s'activent qu'après. Regarder la caméra : les cinq poses s'enchaînent (face, gauche, droite, haut, bas) et la capture s'arrête après 25 images valides.
3. Étape 2 : remplir la fiche (identité, préférences, repères, derniers achats, notes, rendez-vous).
4. Étape 3 : vérifier, puis **Enregistrer le client**.
5. Ouvrir la page **Reconnaissance**, cliquer sur **Démarrer la caméra**. Le client enregistré est reconnu et sa fiche s'affiche.

La base est stockée dans le navigateur de l'appareil. **Exporter** produit un fichier JSON, **Importer** le recharge sur un autre navigateur ou un autre appareil.

### Moteur de calcul

Le site calcule sur le processeur (WASM) par défaut : c'est le réglage le plus sûr sur tous les postes. Deux options dans l'adresse :

- `?moteur=hybride` : détection sur la carte graphique, reconnaissance sur le processeur. Le plus rapide avec une carte dédiée.
- `?moteur=webgpu` : tout sur la carte graphique.

Le choix est mémorisé dans le navigateur de l'appareil, pour toutes les pages ; `?moteur=wasm` revient au processeur.

Sous Windows, Edge utilise le GPU intégré par défaut. Pour la carte dédiée : Paramètres, Affichage, Graphiques, Microsoft Edge sur « Hautes performances ».

## Publier sur GitHub Pages

Le dossier `site/` est publié par le workflow `.github/workflows/pages.yml` à chaque push sur `main`, après les tests Node.

Pour activer la publication : dans les réglages du dépôt, rubrique **Pages**, choisir **GitHub Actions** comme source.

Le dossier `site/models/` contient les deux modèles de visage (`det_500m.onnx` et `w600k_mbf.onnx`), versionnés pour que le site fonctionne en ligne. Ils sont réservés à la recherche non commerciale, voir [docs/DECISIONS.md](docs/DECISIONS.md), D-033.

## Architecture de la version web

```
site/
  index.html, clients.html, indicateurs.html   pages
  css/app.css
  js/config.js               seuils et paramètres
  js/coeur/                  logique pure : suivi, lissage, suggestion, validation, base, enrôlement, indicateurs
  js/navigateur/             caméra, moteur ONNX Runtime Web, stockage, graphiques
  js/pages/                  scripts des trois pages
  models/                    modèles de visage (versionnés, voir D-033)
  tests/                     tests Node (logique, indicateurs, parité avec InsightFace) et test de bout en bout
```

- La détection (SCRFD `det_500m`) et la reconnaissance (`w600k_mbf`) tournent avec ONNX Runtime Web.
- Le pipeline est identique à la version Python : détection une image sur K, suivi par IoU, reconnaissance par similarité cosinus (seuil 0,35), lissage 3 sur 5.
- Les images ne sont jamais écrites sur le disque et ne sont envoyées à aucun service. Seul un gabarit de 512 nombres est conservé, après consentement.

Détails : [site/README.md](site/README.md).

## Tests

```powershell
cd site
npm ci
npm test                                  # 45 tests : logique, indicateurs, parité si les données existent
```

Le test de parité et le test de bout en bout utilisent des données régénérables, non versionnées :

```powershell
python evaluation\preparer_donnees.py     # référence de parité et vidéos de caméra simulée
python site\tests\e2e\test_navigateur.py  # Edge piloté avec une caméra simulée
```

## Évaluation

```powershell
python evaluation\preparer_donnees.py
python evaluation\robustesse.py           # distance, lumière, flou, inclinaison, masque, bruit, compression ; FAR et FRR
python evaluation\mesures_navigateur.py   # indicateurs du site dans Edge, par moteur
```

Les résultats chiffrés sont versionnés dans `evaluation/resultats/`.

## Présentation

`presentation/` génère le support de soutenance à partir des résultats mesurés (`mesures.js`, commun aux deux langues) :

- en anglais, avec le thème de la maison : `Maison-Test-client-recognition.pptx` et sa version PDF ;
- en français (première version) : `Maison-Test-reconnaissance-client.pptx` et sa version PDF.

```powershell
cd presentation
npm ci
npm run deck       # anglais
npm run deck:fr    # français
```

Les captures d'écran (`presentation/images/`) sont refaites par `python presentation\captures.py`, avec les visages pixélisés.

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
- [Brouillon du post LinkedIn](docs/LINKEDIN.md)
- [Procédure des fiches de démonstration](demo/PROCEDURE.md)
