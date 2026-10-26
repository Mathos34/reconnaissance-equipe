"""Prépare les données de test à partir de l'image d'exemple fournie avec InsightFace.

Produit dans evaluation/donnees/ (ignoré par git) :
- reference_parite.json : visages et embeddings calculés par InsightFace (Python), pour le test de parité JS ;
- camera_enregistrement.y4m : un visage isolé, pour l'inscription et la reconnaissance (test de bout en bout) ;
- camera_inconnu.y4m : un autre visage, jamais enregistré.

Usage : python evaluation/preparer_donnees.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from commun import DOSSIER_DONNEES, application, dossier_images_insightface, ecrire_json, ecrire_y4m, image_exemple, recadrer  # noqa: E402


def visage_isole(app, image, boite):
    """Recadrage autour d'une boîte, retenu seulement s'il ne contient qu'un visage assez grand pour l'enrôlement."""
    crop = recadrer(image, boite, marge=1.8, cote=600)
    visages = app.get(crop)
    if len(visages) != 1:
        return None, len(visages)
    largeur = visages[0].bbox[2] - visages[0].bbox[0]
    return (crop if largeur >= 120 and visages[0].det_score >= 0.6 else None), len(visages)


def main() -> int:
    app = application()
    image = image_exemple("t1.jpg")
    visages = sorted(app.get(image), key=lambda f: -f.det_score)
    print(f"Image d'exemple : {image.shape[1]} x {image.shape[0]}, {len(visages)} visages détectés")

    reference = {
        "image": str(dossier_images_insightface() / "t1.jpg"),
        "largeur": int(image.shape[1]),
        "hauteur": int(image.shape[0]),
        "visages": [
            {
                "boite": [float(v) for v in f.bbox],
                "score": float(f.det_score),
                "kps": [[float(a), float(b)] for a, b in f.kps],
                "embedding": [float(v) for v in f.normed_embedding],
            }
            for f in visages
        ],
    }
    ecrire_json(DOSSIER_DONNEES / "reference_parite.json", reference)

    isoles = []
    for f in visages:
        crop, n = visage_isole(app, image, f.bbox)
        if crop is not None:
            isoles.append(crop)
        if len(isoles) == 2:
            break
    if len(isoles) < 2:
        print("Pas assez de visages isolés pour les vidéos de test.")
        return 1
    ecrire_y4m(isoles[0], DOSSIER_DONNEES / "camera_enregistrement.y4m")
    ecrire_y4m(isoles[1], DOSSIER_DONNEES / "camera_inconnu.y4m")
    print(f"Données écrites dans {DOSSIER_DONNEES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
