# Journal des décisions

Chaque décision indique le contexte, les alternatives écartées et les raisons.

> **Note.** Le dossier fourni était vide à la reconstruction du projet : les entrées D-001 à D-016 n'y figuraient pas. Ce journal démarre donc à D-017, comme demandé. Si des entrées antérieures existent ailleurs, les ajouter ici sans renuméroter.

---

## D-017 : interface web locale plutôt qu'une fenêtre OpenCV

**Contexte.** La fiche client doit être soignée (typographie serif, mise en page sobre, lisible à 1920 x 1080) et se mettre à jour en direct pendant la démo. Il faut aussi afficher des accents, que `cv2.putText` ne gère pas.

**Alternatives écartées.**
- Une fenêtre OpenCV unique : rendu limité, texte sans accents, mise en page difficile.
- Une application de bureau (Tkinter, Qt) : plus de code, dépendance supplémentaire, rendu moins libre.
- Une page web servie à distance : inutile pour une démo locale, et les données clients ne doivent pas sortir de la machine.

**Raisons.** HTML et CSS donnent un rendu soigné sans framework. FastAPI sert le flux MJPEG et les mises à jour en direct (Server-Sent Events). Le serveur n'écoute que sur `127.0.0.1`.

---

## D-018 : exécution sur CPU pour la démo

**Contexte.** Machine de démo : AMD Ryzen 7 5800H (8 cœurs, 16 threads), 15,3 Go de RAM, NVIDIA RTX 3060 Laptop 6 Go, et seulement 15,1 Go libres sur le disque C: (475,7 Go au total). ONNX Runtime installé n'expose que `AzureExecutionProvider` et `CPUExecutionProvider`. CUDA et cuDNN ne sont pas installés. Vérifié dans le code d'InsightFace 2.1 (`model_zoo/arcface_onnx.py`) : `ctx_id < 0` force `CPUExecutionProvider` sur le modèle de reconnaissance.

**Alternatives écartées.**
- `onnxruntime-gpu` avec CUDA et cuDNN : demande plusieurs Go de bibliothèques, sur 15 Go libres. Risque de saturer le disque, installation fragile sur Windows. Non justifié tant que le CPU tient la cible.

**Raisons.** Le CPU suffit probablement pour `buffalo_s` (à confirmer par `bench.py`). Le code choisit désormais `ctx_id` automatiquement : `0` si `CUDAExecutionProvider` est disponible, `-1` sinon (`backend.choisir_ctx_id`). Un futur `onnxruntime-gpu` s'active donc sans modifier le code.

---

## D-019 : modèle par défaut `buffalo_s`, `buffalo_l` mesuré

**Contexte.** Poids indicatifs d'après une recherche web (à vérifier au téléchargement) : `buffalo_s` ~159 Mo (détection 500 MF, reconnaissance MobileFaceNet), `buffalo_l` ~326 Mo (détection RetinaFace-10G, reconnaissance ResNet50). Disque : 15 Go libres. Cible : 10 fps.

**Alternatives écartées.**
- `buffalo_l` par défaut : meilleure précision selon le tableau cité, mais poids deux fois plus lourd et calcul CPU plus long. À reconsidérer si `bench.py` montre qu'il tient 10 fps avec K = 3.
- `buffalo_sc` (~16 Mo, sans modèles d'alignement ni d'attributs selon une source tierce) : trop peu documenté pour un choix par défaut.

**Raisons.** Marge disque et vitesse CPU. Les deux modèles restent disponibles et sont comparés par `bench.py`.

---

## D-020 : InsightFace 2.1 épinglé

**Contexte.** PyPI propose `insightface` 2.1 (wheel pure Python, 1,1 Mo), après la 0.7.3 plus ancienne et plus documentée. La 2.1 ajoute des extras non utilisés (GUI, liveness, PrivateFrame).

**Alternatives écartées.**
- 0.7.3 : API bien documentée, mais compilation C++ et Cython possible sous Windows.

**Raisons.** Installation sans compilation sous Windows. L'API `FaceAnalysis(name, allowed_modules, ...)`, `prepare(ctx_id, det_thresh, det_size)`, `get(img)` et les attributs `bbox`, `det_score`, `normed_embedding` ont été vérifiés dans le code source de la 2.1. L'import ne télécharge rien (vérifié). Les dépendances lourdes (scipy, scikit-image) sont acceptées.

---

## D-021 : licence des poids, usage de recherche uniquement

**Contexte.** Le code InsightFace est sous licence MIT. Le README officiel précise que les poids pré-entraînés sont réservés à la recherche non commerciale, qu'ils soient téléchargés automatiquement ou à la main. C'est un projet d'école, sans commercialisation.

**Alternatives écartées.**
- Modèles sous Apache 2.0 (par exemple YuNet et SFace d'OpenCV Zoo, cités par une source tierce non vérifiée) : à étudier si le projet devient commercial.

**Raisons.** Le contexte scolaire respecte la restriction. Elle est signalée dans le README racine et dans le rapport. Tout usage hors recherche imposerait de changer de modèle.

---

## D-022 : aucune image conservée, embeddings uniquement

**Contexte.** Exigence du brief : les données restent locales, les visages inconnus ne sont jamais enregistrés. Les embeddings restent des données biométriques, même avec des clients fictifs.

**Alternatives écartées.**
- Sauvegarder les recadrages de visage pour déboguer : refusé.
- Sauvegarder les images d'enrôlement, pour les réentraîner plus tard : refusé, l'enrôlement ne garde que le gabarit.

**Raisons.** Les images restent en mémoire le temps d'être traitées (`pipeline.py`, `enroll.py`). La galerie ne contient que des vecteurs de 512 nombres. Les visages inconnus sont oubliés à la fin de chaque image. Le dossier `data/` est ignoré par git.

---

## D-023 : consentement par saisie de « J'ACCEPTE »

**Contexte.** Le brief exige qu'une personne tape « J'ACCEPTE » au clavier avant tout enrôlement. Sans cette saisie, rien n'est enregistré.

**Alternatives écartées.**
- Une case à cocher dans l'interface : plus facile à cocher sans lire, donc moins probant pour un consentement.
- Un consentement implicite (la personne se place devant la caméra) : refusé.

**Raisons.** La saisie est délibérée. La date est notée dans la fiche (`consentement.date`). La comparaison ignore la casse et accepte l'apostrophe typographique (`enroll._reponse_ok`). L'ordre d'écriture est fixé : la fiche (consentement) est écrite avant la galerie (gabarit). Si la seconde écriture échoue, il existe un consentement sans gabarit, ce qui n'a aucun effet sur la reconnaissance. L'inverse, un gabarit actif sans consentement, est impossible.

---

## D-024 : format de `clients.json`

**Contexte.** Les fiches doivent être lisibles, modifiables à la main et ignorées par git. Le volume est de quelques clients.

**Alternatives écartées.**
- SQLite : plus robuste pour plusieurs écrivains, mais plus de code et non demandé pour une démo mono-poste.

**Raisons.** Une liste de fiches en JSON. Validation à la lecture (`clients.valider`), écriture atomique par fichier temporaire, champs optionnels absents sans erreur. Le champ `civilite` est obligatoire, car la suggestion d'accueil s'appuie dessus.

---

## D-025 : suivi par IoU, détection une image sur K, lissage 3 sur 5

**Contexte.** Le calcul de détection et d'embedding est le goulot d'étranglement. Il faut garder l'identité d'un visage entre deux calculs, sans clignotement.

**Alternatives écartées.**
- SORT ou ByteTrack avec filtre de Kalman : plus robustes en mouvement rapide, mais plus complexes à expliquer et à tester.
- Une détection à chaque image : trop lent sur CPU.

**Raisons.** Appariement glouton par IoU (seuil 0,3), suppression après 5 détections sans correspondance. Le lissage affiche un client si 3 décisions sur les 5 dernières concordent. Une démo avec une ou deux personnes suffit à ce niveau de complexité.

---

## D-026 : seuil initial 0,35, à recalibrer sur place

**Contexte.** La similarité cosinus des embeddings ArcFace de type `w600k` se situe couramment autour de 0,3 à 0,4 selon les usages. Aucune mesure n'a été faite avec la caméra de la démo.

**Alternatives écartées.**
- Choisir le seuil sur des données synthétiques : le notebook montre que les résultats dépendent beaucoup du modèle de simulation (voir ses conclusions). Non retenu pour la valeur finale.

**Raisons.** `SEUIL = 0.35` est une valeur de départ, documentée dans `config.py`. La méthode de recalibrage est dans le README racine. La meilleure similarité des visages visibles s'affiche dans une ligne en haut de la vidéo, avec le seuil, y compris quand la personne est « Inconnu ». Le cadre de chaque visage reste limité au nom ou à « Inconnu », comme le demande le brief : la similarité n'apparaît donc pas dans la fiche.

---

## D-027 : aucun téléchargement de poids sans commande explicite

**Contexte.** Règle du brief : ne télécharger aucun dataset ni poids sans demande. Par défaut, InsightFace télécharge les modèles au premier appel.

**Alternatives écartées.**
- Laisser InsightFace télécharger au premier lancement : téléchargement silencieux, interdit par le brief.

**Raisons.** `Detecteur` lève `PoidsAbsents` si les poids manquent, avec la commande à lancer. Le téléchargement n'a lieu que via `python -m boutique.backend --modele <nom> --telecharger`. `bench.py` ne télécharge jamais et marque le modèle « non mesuré ».

---

## D-028 : tests et notebook sans caméra ni modèle

**Contexte.** Le brief exige des tests qui passent sans caméra ni modèle, et un notebook exécuté avec nbclient en mode synthétique.

**Alternatives écartées.**
- Des images de test avec de vrais visages : impossible sans poids ni données réelles.

**Raisons.** Les tests remplacent le détecteur par un faux (`DetecteurFictif`) et les saisies clavier par des réponses scriptées. Les chemins de fichiers sont injectés, pour que les tests n'écrivent jamais dans `data/`. Le notebook génère des embeddings synthétiques et les sosies rendent le test plus dur. Il est exécuté avec `python -m jupyter execute`.

---

## D-029 : Pillow 12.3.0

**Contexte.** Pillow 9.5.0 provoquait une violation d'accès dans FreeType (`ImageFont.getbbox`) sous Windows, pendant les tests du rendu de texte.

**Alternatives écartées.**
- Éviter Pillow et dessiner le texte autrement : plus de code pour un besoin simple.

**Raisons.** Mise à jour vers 12.3.0. La version est épinglée dans `requirements.txt`.

---

## D-030 : hébergement sur un dépôt GitHub privé

**Contexte.** Le projet doit être sauvegardé et partagé avec l'équipe, à titre gratuit, une fois terminé.

**Alternatives écartées.**
- Dépôt public : exposerait le code de reconnaissance et les fiches de démo. Non retenu.

**Raisons.** Dépôt privé sur le compte GitHub de l'auteur. Le dossier `data/` (copie locale des fiches de démo, galerie d'enrôlement), les poids et les images sont exclus par `.gitignore`. Seuls le code, les fiches fictives de `demo/` et la documentation sont versionnés.
