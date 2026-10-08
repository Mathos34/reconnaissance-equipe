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

**Contexte.** Tailles de poids : `buffalo_s` 159 Mo, vérifiées au téléchargement (détection SCRFD 500 MF de 2,4 Mo, reconnaissance MobileFaceNet de 13 Mo, 137 Mo de modèle 3D), et `buffalo_l` environ 326 Mo selon une recherche web, non vérifiée (détection RetinaFace-10G, reconnaissance ResNet50). Disque : 15 Go libres. Cible : 10 fps.

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

**Suite (voir D-031).** La demande de publication accessible par un lien, sans lancement local, change l'architecture. D-030 reste vrai pour le dépôt, mais GitHub Pages n'est pas gratuit sur un dépôt privé : la publication demande un dépôt public ou un compte GitHub Pro.

---

## D-031 : application web statique sur GitHub Pages, calcul dans le navigateur

**Contexte.** Demande : une application publiée sur GitHub, accessible par un lien, sans lancer de serveur localement. Il faut pouvoir ajouter un client en prenant sa photo et en remplissant sa fiche dans le même écran, avec une base simple. Le serveur Python de la version locale ne peut pas tourner sur GitHub Pages, qui ne sert que des fichiers statiques.

**Alternatives écartées.**
- Serveur Python hébergé (Hugging Face Spaces, Render) : les photos des visages partent chez un tiers, l'hébergement gratuit est instable ou limité, et il faut maintenir un serveur.
- Application Claude (artefact) : pratique pour un prototype, mais l'utilisateur demande explicitement GitHub.
- Base de données externe (Supabase, Firebase) : compte à créer, clés à gérer, données chez un tiers. Reste une option si le partage entre appareils devient nécessaire (voir D-035).

**Raisons.** Tout le traitement se fait dans le navigateur de la personne qui utilise la démo. Les images ne quittent jamais l'appareil, et il n'y a aucun serveur à maintenir. Le site est un dossier statique (`site/`) publié par une action GitHub (`.github/workflows/pages.yml`).

**Ce que cela remplace.** D-022 (« aucune donnée ne quitte `data/` ») reste vrai pour les images, qui ne sont jamais conservées. Pour les gabarits, la version web les stocke dans le `localStorage` du navigateur, et plus dans `data/`. La version Python reste disponible comme archive et pour l'évaluation hors ligne.

---

## D-032 : ONNX Runtime Web 1.30.0, WebGPU puis WASM

**Contexte.** Le navigateur doit exécuter les modèles SCRFD (détection) et MobileFaceNet (reconnaissance). ONNX Runtime Web est le moteur qui exécute les mêmes fichiers `.onnx` que la version Python.

**Choix.** Version 1.30.0, chargée depuis le CDN jsDelivr. Elle a été publiée le 14 septembre 2026, soit plus de deux semaines avant la mise en ligne. WebGPU si le navigateur le propose, sinon WASM. `numThreads = 1`, car GitHub Pages n'envoie pas les en-têtes d'isolation d'origine croisée nécessaires aux threads WASM.

**Alternatives écartées.** Un bundler npm (build à maintenir, sans gain pour une démo). TensorFlow.js ou face-api.js : d'autres modèles, donc d'autres résultats à revalider.

---

## D-033 : modèles buffalo_s dans `site/models/`, publication à trancher

**Contexte.** Les deux fichiers nécessaires au navigateur sont `det_500m.onnx` (2,4 Mo) et `w600k_mbf.onnx` (13 Mo), déjà téléchargés pour la version Python. Le téléchargement a été autorisé pour `buffalo_s` seulement.

**Problème.** Les poids InsightFace sont réservés à la recherche non commerciale (D-021). Publier un site public les redistribuerait.

**Décision provisoire.** Les fichiers sont copiés dans `site/models/`, ignoré par git. Le site ne fonctionne donc pas encore en ligne. Publier les fichiers suppose un dépôt public et l'acceptation de cette licence.

**Alternative à évaluer.** YuNet (détection) et SFace (reconnaissance) du projet OpenCV Zoo sont sous licences MIT et Apache 2.0, donc publiables sans restriction. Ils n'ont pas été téléchargés, la permission n'a pas été donnée. Le changement obligerait à revalider les seuils.

---

## D-034 : pipeline porté en JavaScript et validé contre InsightFace

**Contexte.** Le navigateur doit reproduire exactement ce que fait InsightFace en Python, sinon les seuils calibrés ne valent plus.

**Choix.** Le décodage SCRFD (trois niveaux, deux ancres, NMS), le letterbox à 640, l'alignement ArcFace à 112 points et la normalisation ont été portés depuis `insightface/model_zoo/scrfd.py`, `utils/face_align.py` et `model_zoo/arcface_onnx.py` de la version 2.1.

**Validation.** Test de parité (`site/tests/parite.test.mjs`) sur une image d'exemple fournie avec InsightFace, non versionnée. Résultat : les 6 visages sont retrouvés, l'écart maximal des boîtes est de 0,17 px, et la similarité cosinus des embeddings est au moins de 0,9985 par rapport à Python.

---

## D-035 : base simple dans le navigateur, export et import JSON

**Contexte.** Il faut une base simple pour les fiches et les gabarits, sans serveur.

**Choix.** Une seule clé de `localStorage` (`maison-test/v1`) contient les fiches, les gabarits (512 nombres par client) et les consentements. L'export produit un JSON versionné. L'import vérifie toute la sauvegarde avant d'écrire : un fichier invalide ne modifie rien.

**Limites.** Une base par navigateur : les clients ajoutés sur un ordinateur n'apparaissent pas sur un autre sans import. L'export contient les gabarits, donc il doit être conservé avec précaution.

**Alternatives écartées.** IndexedDB (plus de code pour le même service). Supabase ou Firebase (compte, clés, données chez un tiers). À reconsidérer si le partage entre appareils devient une exigence.

---

## D-036 : enrôlement web, poses guidées et consentement obligatoire

**Choix.** Vingt-cinq images valides en cinq poses, comme dans la version Python. Chaque image doit contenir un seul visage, avec un score d'au moins 0,6 et une largeur d'au moins 120 px. Une image est acceptée au plus toutes les 450 ms, pour que les poses aient le temps de changer. L'import de photos est possible à la place de la caméra. Le consentement « J'ACCEPTE » est demandé avant tout nouveau gabarit et sa date est enregistrée. Modifier une fiche sans recapturer ne demande pas de consentement.

**Limite.** Les poses sont guidées à l'écran, mais leur respect n'est pas vérifié. Le contrôle d'angle demanderait une analyse plus fine des points du visage.

**Aucune photo n'est conservée**, pas même une vignette, pour rester cohérent avec D-022.
