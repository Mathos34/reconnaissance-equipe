"""Évaluation de robustesse de la reconnaissance (mêmes modèles buffalo_s que le site, parité vérifiée).

Méthode
- 7 identités : les visages des images d'exemple fournies avec InsightFace (aucune image téléchargée).
- Chaque visage est placé dans une scène 1280 x 720 (format webcam HD), à une largeur de 180 px
  (environ 0,75 m d'une webcam à 70 degrés de champ horizontal, pour un visage de 15 cm).
- Enrôlement : gabarit moyen de 5 variantes légères (lumière, rotation, flou), comme les 25 images du site.
- Test : chaque condition dégradée est appliquée, puis on mesure détection, similarité et identité attribuée
  au seuil 0,35 (le seuil du site).

Limites (à garder en tête en lisant les chiffres)
- 7 identités seulement : les taux sont indicatifs, pas statistiquement solides.
- Enrôlement et test partent de la même photo : la variabilité réelle (expression, coiffure, lunettes,
  vieillissement, autre jour) n'est pas représentée. La reconnaissance réelle sera moins bonne.

Usage : python evaluation/robustesse.py  ->  evaluation/resultats/robustesse.json
"""

from __future__ import annotations

import math
import platform
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from commun import DOSSIER_RESULTATS, SEUIL, application, ecrire_json, image_exemple  # noqa: E402

SCENE = (1280, 720)
LARGEUR_REFERENCE = 180
FOND = 118
CHAMP_HORIZONTAL_DEG = 70
LARGEUR_VISAGE_M = 0.15

CONDITIONS = {
    "taille": {"libelle": "Largeur du visage (px, scène 1280 px)", "niveaux": [220, 180, 140, 100, 70, 50, 35, 25, 18]},
    "luminosite": {"libelle": "Exposition (facteur)", "niveaux": [0.04, 0.07, 0.1, 0.15, 0.25, 0.5, 1.0, 1.8, 2.4, 3.5, 5.0]},
    "flou": {"libelle": "Flou (sigma gaussien, px)", "niveaux": [0, 2, 4, 6, 8, 11, 14, 18]},
    "rotation": {"libelle": "Inclinaison de la tête (degrés)", "niveaux": [0, 10, 20, 30, 45, 60, 90]},
    "occultation": {"libelle": "Bas du visage masqué (part de la hauteur)", "niveaux": [0, 0.2, 0.35, 0.5, 0.65]},
    "bruit": {"libelle": "Bruit du capteur (écart type)", "niveaux": [0, 20, 35, 50, 70, 90, 120]},
    "compression": {"libelle": "Qualité JPEG", "niveaux": [95, 50, 25, 10, 5, 2]},
}


def distance_estimee_m(largeur_px: float) -> float:
    """Distance approximative visage-caméra pour une webcam HD (1280 px, 70 degrés), visage de 15 cm."""
    focale_px = SCENE[0] / (2 * math.tan(math.radians(CHAMP_HORIZONTAL_DEG / 2)))
    return LARGEUR_VISAGE_M * focale_px / largeur_px


def identites(app):
    """Recadrages de visages isolés (avec la boîte du visage dans le recadrage)."""
    resultat = []
    for nom in ("t1.jpg", "Tom_Hanks_54745.png"):
        image = image_exemple(nom)
        tous = app.get(image)
        for f in tous:
            # Les autres visages de la photo sont recouverts : chaque scène ne contient qu'une personne.
            image_seule = image.copy()
            for autre in tous:
                if autre is f:
                    continue
                ax1, ay1, ax2, ay2 = autre.bbox
                marge = 0.25 * (ax2 - ax1)
                cv2.rectangle(image_seule, (int(ax1 - marge), int(ay1 - marge)), (int(ax2 + marge), int(ay2 + marge)), (FOND, FOND, FOND), thickness=-1)
            x1, y1, x2, y2 = f.bbox
            cx, cy, demi = (x1 + x2) / 2, (y1 + y2) / 2, max(x2 - x1, y2 - y1) * 1.6
            h, w = image.shape[:2]
            g, hh, d, b = int(max(0, cx - demi)), int(max(0, cy - demi)), int(min(w, cx + demi)), int(min(h, cy + demi))
            crop = image_seule[hh:b, g:d].copy()
            visages = app.get(cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
            if len(visages) != 1:
                continue  # recadrage qui contient un second visage : écarté
            vx1, vy1, vx2, vy2 = (v / 2 for v in visages[0].bbox)
            resultat.append({"crop": crop, "boite": (vx1, vy1, vx2, vy2)})
    return resultat


def scene(identite, largeur=LARGEUR_REFERENCE, rotation=0.0, occultation=0.0):
    """Place le visage dans une scène 1280 x 720 grise, à la largeur voulue, avec rotation et occultation."""
    crop = identite["crop"].copy()
    x1, y1, x2, y2 = identite["boite"]
    if occultation > 0:
        haut = int(y2 - (y2 - y1) * occultation)
        cv2.rectangle(crop, (int(x1) - 4, haut), (int(x2) + 4, int(y2) + 8), (FOND, FOND, FOND), thickness=-1)
    echelle = largeur / (x2 - x1)
    crop = cv2.resize(crop, None, fx=echelle, fy=echelle, interpolation=cv2.INTER_AREA if echelle < 1 else cv2.INTER_CUBIC)
    cx, cy = (x1 + x2) / 2 * echelle, (y1 + y2) / 2 * echelle
    if rotation:
        matrice = cv2.getRotationMatrix2D((cx, cy), rotation, 1.0)
        crop = cv2.warpAffine(crop, matrice, (crop.shape[1], crop.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    fond = np.full((SCENE[1], SCENE[0], 3), FOND, dtype=np.uint8)
    ox, oy = int(SCENE[0] / 2 - cx), int(SCENE[1] / 2 - cy)
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx0, dy0 = max(0, ox), max(0, oy)
    largeur_copie = min(crop.shape[1] - sx0, SCENE[0] - dx0)
    hauteur_copie = min(crop.shape[0] - sy0, SCENE[1] - dy0)
    fond[dy0:dy0 + hauteur_copie, dx0:dx0 + largeur_copie] = crop[sy0:sy0 + hauteur_copie, sx0:sx0 + largeur_copie]
    return fond


def degrader(image, condition, niveau, rng):
    if condition == "luminosite":
        return np.clip(image.astype(np.float32) * niveau, 0, 255).astype(np.uint8)
    if condition == "flou" and niveau > 0:
        return cv2.GaussianBlur(image, (0, 0), niveau)
    if condition == "bruit" and niveau > 0:
        return np.clip(image.astype(np.float32) + rng.normal(0, niveau, image.shape), 0, 255).astype(np.uint8)
    if condition == "compression":
        ok, tampon = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, int(niveau)])
        return cv2.imdecode(tampon, cv2.IMREAD_COLOR)
    return image


def visage_central(app, image):
    """Le visage détecté le plus proche du centre de la scène (là où le visage a été placé), ou None."""
    visages = app.get(image)
    if not visages:
        return None
    centre = np.array([SCENE[0] / 2, SCENE[1] / 2])
    meilleur = min(visages, key=lambda f: np.linalg.norm(np.array([(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2]) - centre))
    distance = np.linalg.norm(np.array([(meilleur.bbox[0] + meilleur.bbox[2]) / 2, (meilleur.bbox[1] + meilleur.bbox[3]) / 2]) - centre)
    return meilleur if distance < 120 else None


def gabarit(app, identite):
    variantes = [
        scene(identite),
        scene(identite, rotation=5),
        scene(identite, rotation=-5),
        degrader(scene(identite), "luminosite", 0.85, None),
        degrader(scene(identite), "luminosite", 1.15, None),
    ]
    embeddings = [f.normed_embedding for f in (visage_central(app, v) for v in variantes) if f is not None]
    moyenne = np.mean(embeddings, axis=0)
    return moyenne / np.linalg.norm(moyenne)


def main() -> int:
    debut = time.perf_counter()
    app = application()
    rng = np.random.default_rng(0)
    personnes = identites(app)
    gabarits = np.stack([gabarit(app, p) for p in personnes])
    print(f"{len(personnes)} identités enrôlées")

    resultats = {}
    meme_personne, imposteurs = [], []
    for condition, spec in CONDITIONS.items():
        lignes = []
        for niveau in spec["niveaux"]:
            detectes, correctes, fausses, sims = 0, 0, 0, []
            for i, personne in enumerate(personnes):
                if condition == "taille":
                    image = scene(personne, largeur=niveau)
                elif condition == "rotation":
                    image = scene(personne, rotation=niveau)
                elif condition == "occultation":
                    image = scene(personne, occultation=niveau)
                else:
                    image = degrader(scene(personne), condition, niveau, rng)
                visage = visage_central(app, image)
                if visage is None:
                    continue
                detectes += 1
                scores = gabarits @ visage.normed_embedding
                meilleur = int(np.argmax(scores))
                sims.append(float(scores[i]))
                meme_personne.append(float(scores[i]))
                imposteurs.extend(float(s) for j, s in enumerate(scores) if j != i)
                if meilleur == i and scores[i] >= SEUIL:
                    correctes += 1
                elif meilleur != i and scores[meilleur] >= SEUIL:
                    fausses += 1
            n = len(personnes)
            ligne = {
                "niveau": niveau,
                "detection": round(100 * detectes / n, 1),
                "identification": round(100 * correctes / n, 1),
                "faussesAcceptations": fausses,
                "similariteMoyenne": round(statistics.fmean(sims), 3) if sims else None,
            }
            if condition == "taille":
                ligne["distanceEstimeeM"] = round(distance_estimee_m(niveau), 2)
            lignes.append(ligne)
        resultats[condition] = {"libelle": spec["libelle"], "niveaux": lignes}
        print(f"  {condition:12s} " + " | ".join(f"{l['niveau']}: {l['identification']:.0f} %" for l in lignes))

    seuils = [round(s / 100, 2) for s in range(0, 101)]
    courbe = []
    for t in seuils:
        frr = 100 * sum(s < t for s in meme_personne) / len(meme_personne)
        far = 100 * sum(s >= t for s in imposteurs) / len(imposteurs)
        courbe.append({"seuil": t, "far": round(far, 2), "frr": round(frr, 2)})
    eer = min(courbe, key=lambda c: abs(c["far"] - c["frr"]))

    def histo(valeurs):
        classes = [{"debut": round(-0.2 + k * 0.05, 2), "n": 0} for k in range(24)]
        for v in valeurs:
            classes[min(23, max(0, int((v + 0.2) // 0.05)))]["n"] += 1
        return classes

    # Performance CPU de la même chaîne en Python (détection + embedding d'un visage, scène 1280 x 720).
    image = scene(personnes[0])
    for _ in range(3):
        app.get(image)
    durees = []
    for _ in range(40):
        t0 = time.perf_counter()
        app.get(image)
        durees.append((time.perf_counter() - t0) * 1000)

    sortie = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "machine": f"{platform.processor()} ({platform.system()} {platform.release()})",
        "modele": "buffalo_s (det_500m + w600k_mbf)",
        "seuil": SEUIL,
        "identites": len(personnes),
        "methode": "Scène 1280 x 720, visage de 180 px par défaut, gabarit moyen de 5 variantes. Même photo source pour enrôlement et test.",
        "conditions": resultats,
        "distributions": {
            "memePersonne": {"n": len(meme_personne), "moyenne": round(statistics.fmean(meme_personne), 3), "min": round(min(meme_personne), 3), "histogramme": histo(meme_personne)},
            "imposteurs": {"n": len(imposteurs), "moyenne": round(statistics.fmean(imposteurs), 3), "max": round(max(imposteurs), 3), "histogramme": histo(imposteurs)},
        },
        "courbe": courbe,
        "auSeuil": next(c for c in courbe if c["seuil"] == SEUIL),
        "tauxEgalErreur": eer,
        "performancePython": {
            "p50Ms": round(statistics.median(durees), 1),
            "p95Ms": round(sorted(durees)[int(0.95 * (len(durees) - 1))], 1),
            "iterations": len(durees),
        },
        "dureeEvaluationS": round(time.perf_counter() - debut, 1),
    }
    ecrire_json(DOSSIER_RESULTATS / "robustesse.json", sortie)
    print(f"Au seuil {SEUIL} : FAR {sortie['auSeuil']['far']} %, FRR {sortie['auSeuil']['frr']} %. EER vers {eer['seuil']}.")
    print(f"Python CPU : {sortie['performancePython']['p50Ms']} ms par image (p50). Résultats : {DOSSIER_RESULTATS / 'robustesse.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
