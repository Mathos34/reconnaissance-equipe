# Benchmark des modèles

Date : 08/10/2026 11:09
Machine : AMD64 Family 25 Model 80 Stepping 0, AuthenticAMD (Windows 11)
Source des images : camera
Cible : 10 fps. K = 3 (détection une image sur K).

| Modèle | Statut | Visages par image | Détection moy. (ms) | Détection p90 (ms) | fps (k=1) | fps (k=K) | Cible atteinte |
|---|---|---|---|---|---|---|---|
| buffalo_s | mesuré | 1.0 | 39.0 | 58.0 | 25.7 | 77.0 | oui |

fps (k=1) = 1 / temps de détection. fps (k=K) = K / temps de détection, sans le suivi ni le dessin.
Source « synthetique » : bruit sans visage, donc 0 visage attendu. Source « camera » : le nombre de visages
dépend de ce qui se trouve devant la caméra pendant la mesure. Aucune image n'est conservée.
Les chiffres sont ceux mesurés sur cette machine, sans arrondi cosmétique.
