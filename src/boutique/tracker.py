"""Suivi des visages entre deux calculs, par recouvrement des boîtes (IoU).

Le suiveur est appelé à chaque détection (une image sur K). Entre deux détections,
il garde la dernière boîte connue de chaque piste pour l'affichage.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import ABSENCE_MAX, SEUIL_IOU

Boite = tuple[float, float, float, float]


def iou(a: Boite, b: Boite) -> float:
    """Intersection sur union de deux boîtes (x1, y1, x2, y2)."""
    largeur = min(a[2], b[2]) - max(a[0], b[0])
    hauteur = min(a[3], b[3]) - max(a[1], b[1])
    if largeur <= 0 or hauteur <= 0:
        return 0.0
    intersection = largeur * hauteur
    aire_a = (a[2] - a[0]) * (a[3] - a[1])
    aire_b = (b[2] - b[0]) * (b[3] - b[1])
    union = aire_a + aire_b - intersection
    return intersection / union if union > 0 else 0.0


@dataclass
class Piste:
    identifiant: int
    boite: Boite
    absente: int = 0  # détections consécutives sans correspondance


class Suiveur:
    def __init__(self, seuil_iou: float = SEUIL_IOU, absence_max: int = ABSENCE_MAX):
        self._seuil_iou = seuil_iou
        self._absence_max = absence_max
        self._pistes: list[Piste] = []
        self._prochain_identifiant = 1

    def pistes(self) -> list[Piste]:
        return list(self._pistes)

    def mettre_a_jour(self, boites: list[Boite]) -> list[tuple[Piste, int]]:
        """Associe chaque boîte détectée à une piste.

        Renvoie une paire (piste, index de la boîte) pour chaque boîte.
        Une boîte sans piste voisine ouvre une nouvelle piste. Une piste sans
        correspondance pendant plus de ABSENCE_MAX détections est supprimée.
        """
        candidats = sorted(
            (
                (iou(piste.boite, boite), i_piste, i_boite)
                for i_piste, piste in enumerate(self._pistes)
                for i_boite, boite in enumerate(boites)
            ),
            reverse=True,
        )

        piste_par_boite: dict[int, Piste] = {}
        pistes_prises: set[int] = set()
        for score, i_piste, i_boite in candidats:
            if score < self._seuil_iou:
                break
            if i_piste in pistes_prises or i_boite in piste_par_boite:
                continue
            piste = self._pistes[i_piste]
            piste.boite = boites[i_boite]
            piste.absente = 0
            piste_par_boite[i_boite] = piste
            pistes_prises.add(i_piste)

        for i_piste, piste in enumerate(self._pistes):
            if i_piste not in pistes_prises:
                piste.absente += 1

        for i_boite, boite in enumerate(boites):
            if i_boite not in piste_par_boite:
                nouvelle = Piste(identifiant=self._prochain_identifiant, boite=boite)
                self._prochain_identifiant += 1
                self._pistes.append(nouvelle)
                piste_par_boite[i_boite] = nouvelle

        self._pistes = [p for p in self._pistes if p.absente <= self._absence_max]
        return [(piste_par_boite[i], i) for i in range(len(boites))]
