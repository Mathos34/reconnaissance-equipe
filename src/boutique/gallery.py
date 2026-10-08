"""Galerie des gabarits d'embeddings, liés à un identifiant client (data/gallery.npz).

Un gabarit est la moyenne normalisée des embeddings capturés pendant l'enrôlement.
Seuls les vecteurs sont stockés, jamais les images.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

DIMENSION = 512


@dataclass(frozen=True)
class Reconnaissance:
    """Meilleure correspondance. L'identifiant vaut None si le score reste sous le seuil."""

    identifiant: str | None
    score: float


def normaliser(vecteur) -> np.ndarray:
    v = np.asarray(vecteur, dtype=np.float32).reshape(-1)
    norme = float(np.linalg.norm(v))
    if norme == 0.0:
        raise ValueError("Impossible de normaliser un vecteur nul")
    return v / norme


def construire_gabarit(embeddings) -> np.ndarray:
    """Moyenne des embeddings normalisés, puis renormalisée."""
    if len(embeddings) == 0:
        raise ValueError("Au moins un embedding est nécessaire")
    moyenne = np.mean([normaliser(e) for e in embeddings], axis=0)
    return normaliser(moyenne)


class Galerie:
    def __init__(self, gabarits: dict[str, np.ndarray] | None = None):
        self._gabarits: dict[str, np.ndarray] = {}
        for identifiant, gabarit in (gabarits or {}).items():
            self.enroler(identifiant, gabarit)

    @classmethod
    def charger(cls, chemin: Path) -> "Galerie":
        if not chemin.exists():
            return cls()
        with np.load(chemin, allow_pickle=False) as donnees:
            identifiants = [str(i) for i in donnees["identifiants"]]
            matrice = donnees["gabarits"]
        return cls(dict(zip(identifiants, matrice)))

    def sauver(self, chemin: Path) -> None:
        chemin.parent.mkdir(parents=True, exist_ok=True)
        identifiants = np.array(list(self._gabarits), dtype=str)
        if self._gabarits:
            matrice = np.stack(list(self._gabarits.values()))
        else:
            matrice = np.zeros((0, DIMENSION), dtype=np.float32)
        temporaire = chemin.with_suffix(".tmp")
        with open(temporaire, "wb") as fichier:
            np.savez(fichier, identifiants=identifiants, gabarits=matrice)
        os.replace(temporaire, chemin)

    def __contains__(self, identifiant: str) -> bool:
        return identifiant in self._gabarits

    def identifiants(self) -> list[str]:
        return list(self._gabarits)

    def enroler(self, identifiant: str, gabarit) -> None:
        self._gabarits[identifiant] = normaliser(gabarit)

    def supprimer(self, identifiant: str) -> bool:
        return self._gabarits.pop(identifiant, None) is not None

    def reconnaitre(self, embedding, seuil: float) -> Reconnaissance:
        if not self._gabarits:
            return Reconnaissance(None, 0.0)
        identifiants = list(self._gabarits)
        matrice = np.stack([self._gabarits[i] for i in identifiants])
        scores = matrice @ normaliser(embedding)
        meilleur = int(np.argmax(scores))
        score = float(scores[meilleur])
        return Reconnaissance(identifiants[meilleur] if score >= seuil else None, score)
