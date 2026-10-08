"""Dessin de texte accentué sur des images OpenCV.

cv2.putText ne sait pas afficher les accents : on passe par Pillow pour le texte.
"""

from __future__ import annotations

from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

POLICES_SYSTEME = (
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial.ttf",
)


@lru_cache(maxsize=8)
def _police(taille: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for chemin in POLICES_SYSTEME:
        try:
            return ImageFont.truetype(chemin, taille)
        except OSError:
            continue
    return ImageFont.load_default()


def ecrire(image_bgr: np.ndarray, texte: str, position: tuple[int, int], taille: int = 24,
           couleur: tuple[int, int, int] = (255, 255, 255), fond: tuple[int, int, int] | None = None) -> np.ndarray:
    """Renvoie une copie de l'image avec le texte écrit à partir de position (coin haut-gauche).

    Les couleurs sont en BGR, comme OpenCV. Si fond est donné, un rectangle de cette couleur
    est dessiné derrière le texte pour le rendre lisible.
    """
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(image_rgb)
    dessin = ImageDraw.Draw(pil)
    police = _police(taille)
    couleur_rgb = (couleur[2], couleur[1], couleur[0])
    if fond is not None:
        x1, y1, x2, y2 = dessin.textbbox(position, texte, font=police)
        marge = 6
        fond_rgb = (fond[2], fond[1], fond[0])
        dessin.rectangle((x1 - marge, y1 - marge, x2 + marge, y2 + marge), fill=fond_rgb)
    dessin.text(position, texte, font=police, fill=couleur_rgb)
    return cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
