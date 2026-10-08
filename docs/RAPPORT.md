# Rapport d'avancement : démo « Maison Test »

*Public visé : l'équipe projet et l'enseignant. État au 8 octobre 2026.*

## Ce qui fonctionne

- **Fiches clients** : 4 fiches fictives (`demo/clients.json`), validées à la lecture. Suggestion d'accueil selon l'heure (avant et après 12 h), avec sucre et lait affichés pour confirmation.
- **Enrôlement** : `python -m boutique.enroll --client C001`. Refus sans la saisie « J'ACCEPTE » (vérifié en exécution réelle). Refus d'un doublon, mise à jour après confirmation, suppression avec ou sans `--purge`.
- **Serveur web** : démarre, sert la page de démo et `/etat`. En l'absence de poids, il signale le problème à l'écran au lieu de planter (vérifié).
- **Reconnaissance** : suivi par IoU, détection une image sur K, lissage 3 sur 5. Logique entièrement couverte par les tests, sans caméra ni modèle.
- **Tests** : 88 tests, tous passent. Ils couvrent les fiches, l'enrôlement, la suppression, la suggestion selon l'heure, le suivi, le lissage, la galerie, le pipeline et le serveur.
- **Notebook d'évaluation** : `notebooks/01_reconnaissance_equipe.ipynb`, exécuté avec ses sorties en mode synthétique, sans erreur. Il illustre le choix du seuil et le délai du lissage.
- **Confidentialité** : aucune image n'est écrite sur le disque. Les visages inconnus restent en mémoire. Le dossier `data/` est ignoré par git.

## Fps mesurés

Modèle `buffalo_s` (téléchargé avec autorisation, 159 Mo). `buffalo_l` n'est pas téléchargé : « non mesuré ».

| Mesure | Résultat |
|---|---|
| Détection seule, webcam, 3 passages | 34 à 44 ms par image, soit 23 à 29 fps (k=1) |
| Détection seule, webcam, 1 passage détaillé | 39 ms moyenne, p90 58 ms, 1 visage par image |
| Détection seule, images synthétiques | 16,5 ms, soit 60 fps (k=1) |
| **Serveur complet, webcam, de bout en bout** | **environ 30 fps**, cadence de la caméra |

Ces chiffres sont sur CPU : AMD Ryzen 7 5800H (8 cœurs), sans GPU (voir D-018). La cible de 10 fps est tenue avec de la marge. Le débit de bout en bout est plafonné par la caméra, à 30 images par seconde.

Le détail est dans `docs/BENCH.md`. La variance entre passages est forte (19,6 ms, 59,6 ms, puis 34 à 44 ms), sans cause identifiée : charge du PC ou synchronisation OneDrive possibles.

## Ce qui n'est pas encore vérifié

- La reconnaissance d'un client enrôlé : la détection fonctionne sur un vrai visage (1 visage par image), mais aucun client n'est enrôlé pour l'instant, donc aucune fiche n'a été affichée en direct.
- L'enrôlement avec la caméra : la capture n'a été testée qu'avec des images synthétiques.
- Le rendu de la page dans un navigateur à 1920 x 1080. La syntaxe JavaScript est vérifiée, pas l'affichage.
- Le seuil `SEUIL = 0,35`, qui n'est qu'une valeur de départ. Il doit être recalibré avec la caméra et l'éclairage de la démo.

## Ce qui reste à faire avant la présentation

1. Enrôler les membres de l'équipe qui joueront les clients, puis recalibrer `SEUIL` (procédure dans le README racine).
3. Tester la démo de bout en bout à 1920 x 1080 : cadre, nom, fiche, bouton Masquer, écran d'accueil.
4. Vérifier que la webcam est bien l'index 0 (`INDEX_CAMERA` dans `config.py`).
5. Si `buffalo_l` est souhaité : 326 Mo de poids supplémentaires, à mesurer avant de décider (D-019).

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
