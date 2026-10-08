# Recréer les fiches de démonstration

Les 4 fiches sont **fictives**. Elles sont dans `demo/clients.json`. Le dossier `data/`, où l'application lit les fiches, est ignoré par git et n'est jamais publié. Il faut donc recréer `data/clients.json` à chaque nouvelle copie du projet.

## Méthode 1 : copier le fichier (recommandée)

Depuis la racine du projet, dans PowerShell :

```powershell
New-Item -ItemType Directory -Force data | Out-Null
Copy-Item demo\clients.json data\clients.json
```

Vérifier que les 4 fiches sont valides :

```powershell
$env:PYTHONPATH = "src"
python -c "from boutique.clients import Clients; from pathlib import Path; print(Clients.charger(Path('data/clients.json')).identifiants())"
```

Résultat attendu : `['C001', 'C002', 'C003', 'C004']`.

## Méthode 2 : recréer à la main

Les fiches sont aussi résumées ici, pour les retrouver sans ouvrir le JSON.

| Identifiant | Nom affiché | Boisson | Température | Sucre | Lait | Conseiller |
|---|---|---|---|---|---|---|
| C001 | Madame Claire Test | café glacé | froide | non | lait d'amande | Camille Conseil |
| C002 | Monsieur Antoine Démo | thé chaud au miel | chaude | non | aucun | Hugo Vendeur |
| C003 | Madame Sophie Exemple | espresso serré | chaude | 1 morceau | aucun | Camille Conseil |
| C004 | Madame Léa Fictive | chocolat chaud | chaude | 2 morceaux | lait d'avoine | Hugo Vendeur |

Chaque fiche doit contenir les champs décrits dans `src/boutique/README.md` (section « Fiches clients »). Le fichier `demo/clients.json` en donne un exemple complet.

## Après la création

1. Lancer la démo : `python -m boutique.server`, puis ouvrir http://localhost:8000.
2. Enrôler un membre de l'équipe qui joue un client, par exemple : `python -m boutique.enroll --client C001`. Voir le README racine, section « Enrôlement ».

Les fiches de démo ne contiennent aucune donnée réelle. Ne pas y ajouter de vraies coordonnées, de vrais achats ni de vraies notes.
