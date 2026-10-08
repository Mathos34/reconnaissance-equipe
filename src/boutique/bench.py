"""Mesure des fps selon le modèle (buffalo_s et buffalo_l), sur cette machine.

Usage : python -m boutique.bench [--modele buffalo_s] [--source synthetique|camera] [--images 60]

- Ne télécharge rien. Si les poids manquent, le modèle est marqué "non mesuré".
- Les chiffres sont rapportés tels quels, dans le terminal et dans docs/BENCH.md.
- "synthetique" : image de bruit, donc sans visage. Le temps mesuré est celui de la détection seule.
  "camera" : vraies images de la webcam, avec les visages présents.
"""

from __future__ import annotations

import argparse
import platform
import statistics
import time
from datetime import datetime
from pathlib import Path

import numpy as np

from .backend import MODELES_CONNUS, poids_presents
from .config import FPS_CIBLE, INDEX_CAMERA, K_DETECTION, RACINE

SORTIE = RACINE / "docs" / "BENCH.md"
IMAGES_AVANT_MESURE = 5


def _images(source: str, nombre: int):
    if source == "synthetique":
        generateur = np.random.default_rng(0)
        for _ in range(nombre):
            yield generateur.integers(0, 256, size=(480, 640, 3), dtype=np.uint8)
        return

    import cv2

    capture = cv2.VideoCapture(INDEX_CAMERA)
    if not capture.isOpened():
        raise RuntimeError(f"Caméra {INDEX_CAMERA} introuvable")
    try:
        lues = 0
        while lues < nombre:
            ok, image = capture.read()
            if ok:
                lues += 1
                yield image
    finally:
        capture.release()


def mesurer(modele: str, source: str, nombre: int) -> dict:
    if not poids_presents(modele):
        return {"modele": modele, "statut": "non mesuré (poids absents)"}

    from .backend import Detecteur

    detecteur = Detecteur(modele)
    images = list(_images(source, nombre + IMAGES_AVANT_MESURE))
    for image in images[:IMAGES_AVANT_MESURE]:
        detecteur.analyser(image)

    durees_ms = []
    visages_total = 0
    for image in images[IMAGES_AVANT_MESURE:]:
        debut = time.perf_counter()
        visages_total += len(detecteur.analyser(image))
        durees_ms.append((time.perf_counter() - debut) * 1000)

    moyenne = statistics.fmean(durees_ms)
    p90 = sorted(durees_ms)[int(0.9 * (len(durees_ms) - 1))]
    fps_k1 = 1000 / moyenne
    fps_k = K_DETECTION * fps_k1
    return {
        "modele": modele,
        "statut": "mesuré",
        "images": len(durees_ms),
        "visages_par_image": round(visages_total / len(durees_ms), 2),
        "detection_moyenne_ms": round(moyenne, 1),
        "detection_p90_ms": round(p90, 1),
        "fps_k1": round(fps_k1, 1),
        "fps_k": round(fps_k, 1),
    }


def rediger(resultats: list[dict], source: str) -> str:
    lignes = [
        "# Benchmark des modèles",
        "",
        f"Date : {datetime.now():%d/%m/%Y %H:%M}",
        f"Machine : {platform.processor()} ({platform.system()} {platform.release()})",
        f"Source des images : {source}",
        f"Cible : {FPS_CIBLE} fps. K = {K_DETECTION} (détection une image sur K).",
        "",
        "| Modèle | Statut | Détection moy. (ms) | Détection p90 (ms) | fps (k=1) | fps (k=K) | Cible atteinte |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in resultats:
        if r["statut"] != "mesuré":
            lignes.append(f"| {r['modele']} | {r['statut']} | | | | | |")
            continue
        atteinte = "oui" if r["fps_k"] >= FPS_CIBLE else "non"
        lignes.append(
            f"| {r['modele']} | mesuré | {r['detection_moyenne_ms']} | {r['detection_p90_ms']} "
            f"| {r['fps_k1']} | {r['fps_k']} | {atteinte} |"
        )
    lignes += [
        "",
        "fps (k=1) = 1 / temps de détection. fps (k=K) = K / temps de détection, sans le suivi ni le dessin.",
        "Les chiffres sont ceux mesurés sur cette machine, sans arrondi cosmétique.",
        "",
    ]
    return "\n".join(lignes)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mesure des fps par modèle.")
    parser.add_argument("--modele", choices=MODELES_CONNUS, action="append")
    parser.add_argument("--source", choices=("synthetique", "camera"), default="synthetique")
    parser.add_argument("--images", type=int, default=60)
    args = parser.parse_args(argv)

    modeles = args.modele or list(MODELES_CONNUS)
    resultats = []
    for modele in modeles:
        resultat = mesurer(modele, args.source, args.images)
        resultats.append(resultat)
        if resultat["statut"] == "mesuré":
            print(
                f"{modele} : détection moyenne {resultat['detection_moyenne_ms']} ms, "
                f"fps (k=1) {resultat['fps_k1']}, fps (k={K_DETECTION}) {resultat['fps_k']}"
            )
        else:
            print(f"{modele} : {resultat['statut']}. Lancer python -m boutique.backend --modele {modele} --telecharger")

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(rediger(resultats, args.source), encoding="utf-8")
    print(f"Résultats écrits dans {SORTIE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
