# Architecture du paquet `boutique`

Ce document décrit le code du paquet. Pour installer et lancer la démo, voir le [README racine](../../README.md).

## Vue d'ensemble

```
caméra ──► backend.py (détection, embedding)
              │
              ▼
          pipeline.py ──► tracker.py (suivi par IoU)
              │       └─► gallery.py (similarité cosinus)
              │       └─► decision.py (lissage 3 sur 5)
              ▼
          server.py ──► static/ (page web, MJPEG + SSE)
              │
              └─► clients.py + suggest.py (fiche et suggestion d'accueil)

enroll.py : capture 25 images valides ─► gallery.py (gabarit) + clients.py (consentement)
bench.py  : mesure des fps par modèle
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `config.py` | Réglages : seuil, fps cible, index de la caméra, nom de la boutique, chemins, paramètres d'enrôlement. |
| `backend.py` | Détection et embedding avec InsightFace (`buffalo_s` ou `buffalo_l`). Vérifie la présence des poids, ne les télécharge jamais sans commande explicite. |
| `gallery.py` | Gabarits d'embeddings liés à un identifiant client, dans `data/gallery.npz`. Enrôlement, suppression, reconnaissance. |
| `tracker.py` | Suivi des visages entre deux détections par recouvrement des boîtes (IoU). |
| `decision.py` | Lissage par piste : un client s'affiche si 3 décisions sur les 5 dernières concordent. |
| `pipeline.py` | Enchaîne les étapes pour chaque image. Une détection sur K images, le suivi garde l'identité entre deux détections. |
| `clients.py` | Lecture, validation et écriture de `data/clients.json`. |
| `suggest.py` | Suggestion d'accueil selon les préférences et l'heure (voir plus bas). |
| `enroll.py` | Enrôlement, mise à jour, suppression. Commande `python -m boutique.enroll`. |
| `server.py` | Application web locale (FastAPI) : flux vidéo, fiche en direct, page de démo. |
| `rendu.py` | Texte accentué sur les images (`cv2.putText` ne gère pas les accents). |
| `static/` | Page HTML, CSS et JavaScript sans framework. |
| `bench.py` | Mesure des fps pour buffalo_s et buffalo_l. Écrit `docs/BENCH.md`. |

Les tests sont dans `tests/`. Ils n'ouvrent ni la caméra ni un modèle : le détecteur est remplacé par un faux détecteur.

## Flux de traitement

1. **Image** : la caméra fournit une image BGR.
2. **Détection (une image sur K)** : `Detecteur.analyser` renvoie les boîtes, les scores et les embeddings normalisés (512 dimensions).
3. **Suivi** : `Suiveur.mettre_a_jour` associe chaque boîte à une piste existante, par IoU maximal supérieur à `SEUIL_IOU` (0,3). Une boîte sans voisin ouvre une nouvelle piste. Une piste sans correspondance pendant plus de `ABSENCE_MAX` (5) détections est oubliée.
4. **Reconnaissance** : pour chaque boîte associée, `Galerie.reconnaitre` calcule la similarité cosinus avec chaque gabarit et garde la meilleure. Elle renvoie l'identifiant seulement si le score atteint `SEUIL` (0,35).
5. **Lissage** : `Lisseur.ajouter` enregistre la décision de la piste. Le client s'affiche si 3 décisions concordantes sur les 5 dernières.
6. **Affichage** : entre deux détections, la piste garde sa dernière boîte et son identité lissée.

Les images ne sont jamais écrites sur le disque. Les embeddings des visages inconnus restent en mémoire et sont oubliés dès la fin de l'image.

## Logique de suggestion (`suggest.py`)

La fonction `suggerer(fiche, maintenant)` applique les règles suivantes :

| Moment | Ce qui est proposé |
|---|---|
| Avant 12 h | La boisson préférée, dans la température enregistrée. Exemple : « Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ? » |
| À partir de 12 h | La même chose, plus un rappel de la dernière visite : « Dernière visite le 14/09/2026. » |
| Dans tous les cas | Le sucre et le lait sont affichés à part, pour que le conseiller les confirme avec le client. |

Précisions :
- La **dernière visite** est la date la plus récente parmi `derniers_achats`. Sans achat enregistré, aucun rappel n'est ajouté.
- La **température** (`chaud` ou `froid`) est affichée à part (`chaude` ou `froide`). La boisson garde son libellé de fiche, par exemple « café glacé ».
- L'heure de bascule est `HEURE_BASCULE = 12`. À 12 h 00 pile, on est déjà dans la règle de l'après-midi.

Le résultat est un dictionnaire : `accroche`, `boisson`, `temperature`, `sucre`, `lait`, `moment` (`matin` ou `apres_midi`), `derniere_visite`.

## Fiches clients (`data/clients.json`)

Le fichier contient une liste de fiches, une par client. Les champs obligatoires sont vérifiés à la lecture par `clients.valider`.

| Champ | Type | Obligatoire | Exemple |
|---|---|---|---|
| `identifiant` | texte, unique | oui | `"C001"` |
| `prenom`, `nom` | texte | oui | `"Claire"`, `"Test"` |
| `civilite` | texte (`"Madame"`, `"Monsieur"`) | oui | `"Madame"` |
| `conseiller` | texte | oui | `"Camille Conseil"` |
| `preferences.boisson` | texte | oui | `"café glacé"` |
| `preferences.temperature` | `"chaud"` ou `"froid"` | oui | `"froid"` |
| `preferences.sucre` | `"non"` ou entier positif | oui | `"non"` ou `2` |
| `preferences.lait` | texte | oui | `"lait d'amande"`, `"aucun"` |
| `preferences.article` | texte | non (`"un"` par défaut) | `"un"` |
| `taille_vetement` | texte | non | `"38"` |
| `styles`, `cadeaux_notes` | listes de textes | non | `["minimaliste"]` |
| `derniers_achats` | liste de `{date, article, montant}` | non | `{"date": "2026-09-14", "article": "Sac cuir tilleul", "montant": 1240}` |
| `notes` | texte libre | non | `"Aime être accueillie rapidement."` |
| `prochain_rendez_vous` | date-heure ISO ou `null` | non | `"2026-10-20T10:30:00"` |
| `consentement` | `{date, mention}` | écrit par l'enrôlement | `{"date": "2026-10-08T09:30:00", "mention": "J'ACCEPTE"}` |

## Galerie (`data/gallery.npz`)

Deux tableaux : `identifiants` (texte) et `gabarits` (matrice `N x 512`, vecteurs unitaires). Aucune image n'est stockée. Un gabarit est la moyenne normalisée des 25 embeddings capturés à l'enrôlement.

Les embeddings sont des données biométriques, même pour des clients fictifs. Le dossier `data/` est donc ignoré par git, et `--delete` permet de les retirer.

## Choix d'implémentation

- **InsightFace est importé à l'appel** (`Detecteur.__init__`), pas au chargement du module. Les tests et le notebook fonctionnent donc sans le paquet ni les poids.
- **Écritures atomiques** : `clients.json` et `gallery.npz` sont écrits dans un fichier temporaire, puis renommés. Un arrêt brutal ne laisse pas un fichier à moitié écrit.
- **Ordre à l'enrôlement** : la fiche (consentement) est écrite avant la galerie (gabarit). Un gabarit n'est donc jamais actif sans consentement noté (D-023).
- **Résistance de la boucle caméra** : une erreur de chargement ou une caméra interrompue passe l'état en erreur, visible à l'écran. Un rechargement raté garde les dernières données valides et affiche un avertissement.
- **Lisibilité avant performance** : le suivi est un appariement glouton par IoU, sans filtre de Kalman. Pour une démo avec une ou deux personnes à la fois, c'est suffisant.
