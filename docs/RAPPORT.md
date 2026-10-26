# Rapport d'avancement : démo « Maison Test »

*Public visé : l'équipe projet et l'enseignant. État au 26 octobre 2026.*

## Version web (site/)

- **Application statique** : la reconnaissance tourne dans le navigateur, avec ONNX Runtime Web 1.30.0. Processeur (WASM) par défaut, mode hybride ou WebGPU par paramètre d'adresse (D-037). Aucune photo n'est envoyée à un serveur.
- **Parcours complet** : ajout d'un client (consentement « J'ACCEPTE » d'abord, puis capture de 25 images en cinq poses ou import de photos, fiche), export, reconnaissance de la même personne, import dans un profil vierge, puis un visage inconnu reste « Inconnu ».
- **Indicateurs intégrés** (D-039) : tuiles en direct sur la page Reconnaissance, page Indicateurs avec graphiques et export JSON.
- **Parité avec InsightFace** : les 6 visages de l'image de test sont retrouvés, écart maximal des boîtes 0,17 px, similarité des embeddings au moins 0,9985.
- **Tests** : 45 tests Node (logique, indicateurs, parité), 1 test de bout en bout dans Microsoft Edge avec caméra simulée. Tous passent.
- **Revue indépendante** : 20 points relevés, les principaux corrigés (D-038, D-041), dont le consentement qui arrivait après la capture.

### Indicateurs mesurés

Edge 156, Ryzen 7 5800H et RTX 3060, 5 sessions de 12 s par moteur (`evaluation/mesures_navigateur.py`).

| Indicateur | Processeur (défaut) | Hybride, GPU dédié |
|---|---|---|
| Temps d'une analyse (médiane) | 132 ms | 108 ms |
| Délai avant l'affichage de la fiche | 0,34 s | 0,20 s |
| Images affichées par seconde | 19,8 | 24,2 |
| Analyses par seconde | 6,6 | 8,1 |

Robustesse (`evaluation/robustesse.py`, 6 identités, seuil 0,35) : 0 % de fausses acceptations, 11,7 % de refus à tort toutes conditions cumulées, identification à 100 % jusqu'à environ 2 m. Le modèle tient la lumière faible et la compression ; il décroche avec un flou fort, une tête inclinée à 90° ou plus de la moitié du visage masquée. Ces taux sont optimistes : enrôlement et test partent de la même photo.

Enrôlement mesuré : 18,7 s pour 25 images valides.

**Non vérifié :**
- un vrai visage en direct dans les conditions de la soutenance, les mesures utilisent une caméra simulée ;
- les navigateurs autres qu'Edge et les téléphones ;
- le respect des poses : elles sont guidées, pas contrôlées.

**Publication :** dépôt public, site publié par GitHub Actions après les tests. Les modèles InsightFace (usage non commercial, D-021) sont versionnés, ce qui suppose un usage de test sans diffusion commerciale (D-033).

**Présentation :** `presentation/` génère le support (17 diapositives, PowerPoint et PDF) à partir des résultats mesurés.

## Version Python locale (archive)

### Ce qui fonctionne

- **Fiches clients** : 4 fiches fictives (`demo/clients.json`), validées à la lecture. Suggestion d'accueil selon l'heure (avant et après 12 h), avec sucre et lait affichés pour confirmation.
- **Enrôlement** : `python -m boutique.enroll --client C001`. Refus sans la saisie « J'ACCEPTE » (vérifié en exécution réelle). Refus d'un doublon, mise à jour après confirmation, suppression avec ou sans `--purge`.
- **Serveur web** : démarre, sert la page de démo et `/etat`. En l'absence de poids, il signale le problème à l'écran au lieu de planter (vérifié).
- **Reconnaissance** : suivi par IoU, détection une image sur K, lissage 3 sur 5. Logique entièrement couverte par les tests, sans caméra ni modèle.
- **Tests** : 88 tests, tous passent. Ils couvrent les fiches, l'enrôlement, la suppression, la suggestion selon l'heure, le suivi, le lissage, la galerie, le pipeline et le serveur.
- **Notebook d'évaluation** : `notebooks/01_reconnaissance_equipe.ipynb`, exécuté avec ses sorties en mode synthétique, sans erreur. Il illustre le choix du seuil et le délai du lissage.
- **Confidentialité** : aucune image n'est écrite sur le disque. Les visages inconnus restent en mémoire. Le dossier `data/` est ignoré par git.

### Fps mesurés

Modèle `buffalo_s` (téléchargé avec autorisation, 159 Mo). `buffalo_l` n'est pas téléchargé : « non mesuré ».

| Mesure | Résultat |
|---|---|
| Détection seule, webcam, 3 passages | 34 à 44 ms par image, soit 23 à 29 fps (k=1) |
| Détection seule, webcam, 1 passage détaillé | 39 ms moyenne, p90 58 ms, 1 visage par image |
| Détection seule, images synthétiques | 16,5 ms, soit 60 fps (k=1) |
| **Serveur complet, webcam, de bout en bout** | **environ 30 fps**, cadence de la caméra |

Ces chiffres sont sur CPU : AMD Ryzen 7 5800H (8 cœurs), sans GPU (voir D-018). La cible de 10 fps est tenue avec de la marge. Le débit de bout en bout est plafonné par la caméra, à 30 images par seconde.

Le détail est dans `docs/BENCH.md`. La variance entre passages est forte (19,6 ms, 59,6 ms, puis 34 à 44 ms), sans cause identifiée : charge du PC ou synchronisation OneDrive possibles.

### Ce qui n'est pas vérifié dans la version Python

- La reconnaissance d'un client enrôlé en direct : la détection fonctionne sur un vrai visage, mais aucune fiche n'a été affichée en direct avec cette version.
- L'enrôlement avec la caméra : la capture n'a été testée qu'avec des images synthétiques.

## Ce qui reste à faire avant la présentation

1. Sur le PC de démo : régler Microsoft Edge sur « Hautes performances » (Paramètres, Affichage, Graphiques), ouvrir le site avec `?moteur=hybride`.
2. Enrôler les membres de l'équipe qui joueront les clients, avec l'éclairage de la salle, et garder un export JSON de secours.
3. Vérifier le seuil 0,35 en direct : la similarité de chaque client et d'une personne non enregistrée s'affiche dans les indicateurs.
4. Répéter la démo de 4 minutes (diapositive 10 du support) et compléter les noms de l'équipe sur la diapositive de titre.

## Points à signaler

- **Licence des poids.** Les modèles InsightFace sont réservés à la recherche non commerciale (D-021). Acceptable pour un projet d'école, à changer pour tout autre usage.
- **Biométrie.** Les gabarits de visage sont des données biométriques, même pour une démo avec des membres de l'équipe. Ils sont supprimables avec `--delete` et `--purge`.
- **Journal des décisions.** Les entrées D-001 à D-016 ne figuraient pas dans le dossier de départ. Le journal démarre à D-017.
- **Révocation du consentement.** `--delete` sans `--purge` retire le gabarit et garde la fiche, comme le demande le brief, donc la mention « J'ACCEPTE » et sa date restent. Il n'y a pas encore de trace de révocation. Question à trancher avec l'enseignant : faut-il la noter ?

## Revue de code

Une revue indépendante a comparé le code au brief, puis chaque défaut a été vérifié en lisant le code. Sur 10 défauts candidats, 9 ont été confirmés et corrigés :

- l'ordre d'écriture de l'enrôlement (consentement avant gabarit) ;
- la boucle caméra : erreurs de rechargement, caméra interrompue, chargement du modèle, tous signalés à l'écran ;
- le libellé « Inconnu » (sans score) et le pied de fiche supprimés, conformément au brief ; la similarité passe dans une ligne en haut de la vidéo ;
- le sucre à 0 affiché « sans sucre » ;
- quatre tests qui ne prouvaient pas ce que leur nom annonçait (filtrage des images, date la plus récente, oubli du lissage, sucre et lait après 12 h), désormais discriminants.

Le dixième défaut, la révocation du consentement, relève d'une décision de conception (voir ci-dessus).
