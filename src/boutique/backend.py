"""Détection et embedding des visages avec InsightFace (buffalo_s ou buffalo_l).

- InsightFace est importé à l'appel, pas à l'import du module : les tests et le notebook n'en ont pas besoin.
- Les poids ne sont jamais téléchargés en silence. Ils s'obtiennent avec une commande explicite :
  python -m boutique.backend --modele buffalo_s --telecharger
- CPU sur la machine de démo (ONNX Runtime sans CUDA), voir docs/DECISIONS.md, D-018.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import MODELE, SEUIL_DETECTION, TAILLE_DETECTION

MODELES_CONNUS = ("buffalo_s", "buffalo_l")
DOSSIER_INSIGHTFACE = Path.home() / ".insightface"


def choisir_ctx_id() -> int:
    """ctx_id = -1 force le CPU dans InsightFace (constaté dans arcface_onnx.py). 0 = GPU si CUDA est disponible."""
    import onnxruntime

    return 0 if "CUDAExecutionProvider" in onnxruntime.get_available_providers() else -1


class PoidsAbsents(RuntimeError):
    """Les poids du modèle ne sont pas sur le disque et le téléchargement n'a pas été demandé."""


@dataclass(frozen=True)
class Visage:
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 en pixels
    score: float  # score de détection
    embedding: np.ndarray  # vecteur normalisé, 512 dimensions

    @property
    def largeur(self) -> float:
        return self.bbox[2] - self.bbox[0]


def dossier_poids(modele: str) -> Path:
    return DOSSIER_INSIGHTFACE / "models" / modele


def poids_presents(modele: str) -> bool:
    dossier = dossier_poids(modele)
    return dossier.is_dir() and len(list(dossier.glob("*.onnx"))) >= 2


class Detecteur:
    def __init__(self, modele: str = MODELE, telecharger: bool = False, taille=TAILLE_DETECTION):
        if modele not in MODELES_CONNUS:
            raise ValueError(f"Modèle inconnu : {modele!r}. Choisir parmi {MODELES_CONNUS}.")
        if not poids_presents(modele) and not telecharger:
            raise PoidsAbsents(
                f"Poids de {modele} absents ({dossier_poids(modele)}). "
                f"Lancer : python -m boutique.backend --modele {modele} --telecharger"
            )

        from insightface.app import FaceAnalysis

        self._app = FaceAnalysis(name=modele, allowed_modules=["detection", "recognition"])
        self._app.prepare(ctx_id=choisir_ctx_id(), det_thresh=SEUIL_DETECTION, det_size=taille)
        self.modele = modele

    def analyser(self, image_bgr: np.ndarray) -> list[Visage]:
        """Détecte les visages d'une image BGR et calcule leur embedding."""
        visages = []
        for face in self._app.get(image_bgr):
            if face.normed_embedding is None:
                continue
            x1, y1, x2, y2 = (float(v) for v in face.bbox)
            visages.append(
                Visage(
                    bbox=(x1, y1, x2, y2),
                    score=float(face.det_score),
                    embedding=np.asarray(face.normed_embedding, dtype=np.float32),
                )
            )
        return visages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="État des poids InsightFace, et téléchargement explicite.")
    parser.add_argument("--modele", choices=MODELES_CONNUS, default=None)
    parser.add_argument("--telecharger", action="store_true", help="Télécharge les poids (environ 159 à 326 Mo).")
    args = parser.parse_args(argv)
    if args.telecharger and not args.modele:
        parser.error("--telecharger demande explicitement un modèle : --modele buffalo_s ou buffalo_l")

    modeles = [args.modele] if args.modele else list(MODELES_CONNUS)
    for modele in modeles:
        if args.telecharger:
            print(f"Téléchargement de {modele} vers {dossier_poids(modele)} ...")
            Detecteur(modele=modele, telecharger=True)
            print(f"{modele} prêt.")
        else:
            etat = "présents" if poids_presents(modele) else "absents"
            print(f"{modele} : poids {etat} ({dossier_poids(modele)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
