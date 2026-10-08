"""Outils partagés par les tests. Aucun test n'ouvre la caméra ni ne charge un modèle."""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pytest

from boutique.backend import Visage
from boutique.config import RACINE

DEMO_CLIENTS = RACINE / "demo" / "clients.json"


def vecteur(graine: int, dimension: int = 512) -> np.ndarray:
    """Vecteur unitaire déterministe. Deux graines différentes donnent des vecteurs presque orthogonaux."""
    v = np.random.default_rng(graine).normal(size=dimension).astype(np.float32)
    return v / np.linalg.norm(v)


def visage(embedding: np.ndarray, score: float = 0.9, bbox=(100.0, 100.0, 300.0, 320.0)) -> Visage:
    return Visage(bbox=bbox, score=score, embedding=embedding)


@pytest.fixture
def fichier_clients(tmp_path: Path) -> Path:
    """Copie des fiches de démo, dans un dossier temporaire."""
    destination = tmp_path / "clients.json"
    shutil.copyfile(DEMO_CLIENTS, destination)
    return destination


@pytest.fixture
def fichier_galerie(tmp_path: Path) -> Path:
    return tmp_path / "gallery.npz"
