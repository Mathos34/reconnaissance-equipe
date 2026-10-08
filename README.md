# Reconnaissance d'équipe : démo « Maison Test »

Preuve de concept (projet d'école) : une boutique de luxe **fictive**, Maison Test. Quand un client entre dans le champ de la caméra, le conseiller voit sa fiche à côté du flux vidéo : préférences, derniers achats, notes et une suggestion d'accueil adaptée à l'heure.

> **Données fictives.** Les clients de la démo sont des membres de l'équipe qui jouent les clients, avec des fiches inventées. Aucune donnée de vrai client n'est utilisée.
>
> **Biométrie.** Les gabarits de visage sont des données biométriques, même pour une démo. Ils restent dans `data/`, ignoré par git, et se suppriment avec `--delete`.
>
> **Licence des poids.** Le code InsightFace est sous licence MIT. Les poids pré-entraînés (`buffalo_s`, `buffalo_l`) sont réservés à la recherche non commerciale. Voir `docs/DECISIONS.md`, D-021.

Détails techniques : [architecture et logique de suggestion](src/boutique/README.md). Choix d'architecture : [journal des décisions](docs/DECISIONS.md). État d'avancement : [rapport](docs/RAPPORT.md).

## Prérequis

- Windows 11 (testé), Python 3.12, une webcam.
- Environ 1 Go libres sur le disque : les dépendances, puis les poids du modèle (159 Mo pour `buffalo_s`, 326 Mo pour `buffalo_l`).
- Pas de GPU nécessaire. La démo tourne sur CPU (voir D-018).

## Installation

Dans PowerShell, depuis la racine du projet :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Puis, dans chaque nouveau terminal :

```powershell
$env:PYTHONPATH = "src"
```

Vérifier la suite de tests (sans caméra ni modèle) :

```powershell
python -m pytest
```

Si pytest affiche une erreur venant d'un plugin qui n'est pas dans le projet (par exemple `web3`), désactiver le chargement automatique des plugins :

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1"
python -m pytest
```

## Poids du modèle (étape à faire une seule fois)

Les poids ne sont **jamais** téléchargés automatiquement. Il faut les demander explicitement :

```powershell
python -m boutique.backend                                  # état des poids
python -m boutique.backend --modele buffalo_s --telecharger # environ 159 Mo
```

Les poids sont rangés dans `%USERPROFILE%\.insightface\models\`.

## Préparer les fiches de démo

```powershell
New-Item -ItemType Directory -Force data | Out-Null
Copy-Item demo\clients.json data\clients.json
```

Quatre fiches fictives sont créées (C001 à C004). Procédure complète et tableau récapitulatif dans [demo/PROCEDURE.md](demo/PROCEDURE.md).

## Lancer la démo pas à pas

1. Ouvrir un terminal dans la racine du projet, avec `$env:PYTHONPATH = "src"`.
2. Lancer le serveur :
   ```powershell
   python -m boutique.server
   ```
3. Ouvrir http://localhost:8000 dans le navigateur, sur l'écran de 1920 x 1080 si possible.
4. Vérifier le flux vidéo à gauche. Si la caméra ou les poids manquent, le bandeau et le message au-dessus de l'image l'indiquent.
5. Se placer devant la caméra. Après quelques détections, le cadre affiche le prénom et le nom, et la fiche apparaît à droite.
6. Le bouton **Masquer la fiche** cache les informations client, par exemple quand une personne non identifiée est au comptoir.
7. Sans personne reconnue, la fiche affiche l'écran d'accueil neutre.

Pour arrêter, Ctrl+C dans le terminal.

## Enrôlement d'un client

Un client doit être enrôlé avant de pouvoir être reconnu. La fiche doit exister dans `data/clients.json`.

```powershell
python -m boutique.enroll --client C001
```

Déroulé :
1. La commande vérifie que la fiche existe, sinon elle s'arrête avec un message.
2. Elle demande de taper **`J'ACCEPTE`** au clavier. Sans cette saisie, rien n'est enregistré. La date du consentement est alors notée dans la fiche.
3. La caméra s'ouvre. Une consigne s'affiche : face, gauche, droite, haut, bas, soit 5 images par consigne.
4. Une image n'est retenue que si elle contient **un seul visage**, avec un score d'au moins 0,6 et une largeur d'au moins 120 px. Sinon elle est ignorée.
5. Après 25 images retenues, le gabarit est calculé et enregistré. Touche **Échap** pour annuler.

Aucune image n'est écrite sur le disque. Seuls les vecteurs sont conservés.

**Refaire l'enrôlement d'un client déjà enrôlé** : la commande refuse. Pour remplacer le gabarit, utiliser `--update` et taper `oui` pour confirmer.

```powershell
python -m boutique.enroll --client C001 --update
```

**Supprimer un enrôlement** :

```powershell
python -m boutique.enroll --delete C001          # retire le gabarit, la fiche reste
python -m boutique.enroll --delete C001 --purge  # retire le gabarit et la fiche
```

Chaque suppression demande de taper `SUPPRIMER` pour confirmer.

## Ajouter une fiche

1. Ouvrir `data/clients.json` et ajouter une entrée. Copier une fiche existante est le plus simple : il faut au minimum `identifiant`, `civilite`, `prenom`, `nom`, `conseiller` et `preferences` (`boisson`, `temperature`, `sucre`, `lait`).
2. Vérifier que le fichier reste valide. Un identifiant en double ou un champ manquant est signalé :
   ```powershell
   python -c "from boutique.clients import Clients; from pathlib import Path; print(Clients.charger(Path('data/clients.json')).identifiants())"
   ```
3. Enrôler la personne : `python -m boutique.enroll --client C005`.

Le schéma complet des champs est dans [src/boutique/README.md](src/boutique/README.md#fiches-clients-dataclientsjson).

## Recalibrer le seuil

Le seuil `SEUIL` (dans `src/boutique/config.py`, valeur initiale **0,35**) décide si une personne est reconnue. Il dépend de la caméra et de l'éclairage de la démo, donc il doit être recalibré sur place.

Méthode, avec deux membres de l'équipe A et B :
1. Enrôler A (par exemple C001). Ne pas enrôler B.
2. Lancer la démo. La ligne en haut de la vidéo affiche la **similarité** la plus forte parmi les visages visibles, avec le seuil courant. Elle reste affichée quand la personne est « Inconnu », ce qui permet de mesurer les scores d'imposteurs. Le cadre de chaque visage ne montre que le nom ou « Inconnu ».
3. Noter la similarité quand A se présente, plusieurs fois, en variant l'angle et la lumière. Ces valeurs sont les scores « même personne ».
4. Noter la similarité quand B se présente. B n'étant pas enrôlé, elle doit rester sous le seuil. Ce sont les scores d'imposteurs.
5. Choisir `SEUIL` entre les deux. Par défaut, préférer un seuil un peu plus haut que le plus fort score d'imposteur : une fausse reconnaissance est plus gênante qu'un « Inconnu ».
6. Modifier `SEUIL` dans `config.py`, relancer le serveur, et refaire le test.

Le notebook `notebooks/01_reconnaissance_equipe.ipynb` montre la même démarche sur des données synthétiques. Il n'est pas la référence finale, voir sa conclusion.

## Benchmark des modèles

```powershell
python -m boutique.bench                      # buffalo_s et buffalo_l
python -m boutique.bench --modele buffalo_s   # un seul modèle
python -m boutique.bench --source camera      # avec les vraies images de la webcam
```

Le script ne télécharge rien. Un modèle sans poids est marqué « non mesuré ». Les résultats sont écrits dans [docs/BENCH.md](docs/BENCH.md).

## Notebook d'évaluation hors ligne

Le notebook s'exécute sans caméra et sans modèle, avec des embeddings synthétiques :

```powershell
python -m jupyter execute --inplace notebooks\01_reconnaissance_equipe.ipynb
```

L'option `--inplace` enregistre les sorties dans le fichier. Sans elle, le notebook est exécuté mais le fichier reste inchangé.

## Structure du projet

```
src/boutique/     code de la démo (voir src/boutique/README.md)
  static/         page web de démo
  bench.py        mesure des fps
demo/             4 fiches fictives et leur procédure
tests/            tests sans caméra ni modèle
notebooks/        évaluation hors ligne, mode synthétique
docs/             journal des décisions, rapport, benchmark
data/             fiches et galerie réelles de démo, ignoré par git
```

## Dépannage

- **« Caméra introuvable »** : vérifier que la webcam n'est pas utilisée par une autre application. Changer `INDEX_CAMERA` dans `config.py` (0, puis 1, etc.).
- **« Poids absents »** : lancer la commande de téléchargement de la section « Poids du modèle ».
- **La reconnaissance est lente** : voir `docs/BENCH.md`. Augmenter `K_DETECTION` dans `config.py` réduit la charge, au prix d'un suivi moins réactif.
- **Une personne est confondue** : relever la similarité et recalibrer le seuil (section précédente).
