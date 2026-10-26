"""Outils partagés par les scripts d'évaluation.

Les images de test viennent du paquet InsightFace installé (dossier `insightface/data/images`) :
aucune image n'est téléchargée ni versionnée. Les fichiers produits vont dans `evaluation/donnees/`
(ignoré par git) ; les résultats chiffrés vont dans `evaluation/resultats/` (versionné, sans image).
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

RACINE = Path(__file__).resolve().parents[1]
DOSSIER_DONNEES = RACINE / "evaluation" / "donnees"
DOSSIER_RESULTATS = RACINE / "evaluation" / "resultats"
SEUIL = 0.35  # même valeur que site/js/config.js et src/boutique/config.py


def dossier_images_insightface() -> Path:
    import insightface

    return Path(insightface.__file__).resolve().parent / "data" / "images"


def image_exemple(nom: str = "t1.jpg") -> np.ndarray:
    chemin = dossier_images_insightface() / nom
    image = cv2.imread(str(chemin))
    if image is None:
        raise FileNotFoundError(f"Image d'exemple InsightFace introuvable : {chemin}")
    return image


def application(modele: str = "buffalo_s", taille: int = 640):
    """FaceAnalysis sur CPU, détection et reconnaissance seulement (comme le site et le serveur Python)."""
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(name=modele, allowed_modules=["detection", "recognition"], providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_thresh=0.5, det_size=(taille, taille))
    return app


def recadrer(image: np.ndarray, boite, marge: float = 1.8, cote: int = 600) -> np.ndarray:
    """Recadrage carré centré sur une boîte de visage, agrandi pour simuler une personne proche de la caméra."""
    x1, y1, x2, y2 = boite
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    demi = max(x2 - x1, y2 - y1) * marge / 2
    h, w = image.shape[:2]
    gauche, haut = int(max(0, cx - demi)), int(max(0, cy - demi))
    droite, bas = int(min(w, cx + demi)), int(min(h, cy + demi))
    crop = image[haut:bas, gauche:droite]
    return cv2.resize(crop, (cote, cote), interpolation=cv2.INTER_CUBIC)


def ecrire_json(chemin: Path, donnees) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")


def ecrire_y4m(image: np.ndarray, chemin: Path, images: int = 100, cote: int = 640) -> None:
    """Vidéo YUV4MPEG2 (caméra simulée de Chromium et Edge) qui répète une image fixe."""
    petite = cv2.resize(image, (cote, cote), interpolation=cv2.INTER_AREA)
    yuv = cv2.cvtColor(petite, cv2.COLOR_BGR2YUV_I420).tobytes()
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with open(chemin, "wb") as f:
        f.write(f"YUV4MPEG2 W{cote} H{cote} F10:1 Ip A1:1 C420jpeg\n".encode())
        for _ in range(images):
            f.write(b"FRAME\n")
            f.write(yuv)
