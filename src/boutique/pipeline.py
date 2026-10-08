"""Enchaîne détection, suivi, reconnaissance et lissage, image par image.

Confidentialité : les images ne sont jamais écrites sur le disque. Les embeddings des visages
inconnus restent des variables locales et sont oubliés dès la fin de l'image.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import K_DETECTION, SEUIL
from .decision import Lisseur
from .gallery import Galerie
from .tracker import Boite, Suiveur


@dataclass(frozen=True)
class Affichage:
    piste: int
    boite: Boite
    identifiant: str | None  # client affiché après lissage, None = "Inconnu"
    score: float  # meilleure similarité de la dernière décision


class Pipeline:
    def __init__(
        self,
        detecteur,
        galerie: Galerie,
        seuil: float = SEUIL,
        k: int = K_DETECTION,
        suiveur: Suiveur | None = None,
        lisseur: Lisseur | None = None,
    ):
        if k < 1:
            raise ValueError("k doit valoir au moins 1")
        self._detecteur = detecteur
        self._galerie = galerie
        self._seuil = seuil
        self._k = k
        self._suiveur = suiveur or Suiveur()
        self._lisseur = lisseur or Lisseur()
        self._scores: dict[int, float] = {}
        self._compteur = 0

    def changer_galerie(self, galerie: Galerie) -> None:
        """Remplace la galerie, par exemple après un enrôlement pendant que la démo tourne."""
        self._galerie = galerie

    def traiter(self, image) -> list[Affichage]:
        """Renvoie les visages à afficher pour cette image."""
        if self._compteur % self._k == 0:
            self._detecter(image)
        self._compteur += 1
        return [
            Affichage(
                piste=piste.identifiant,
                boite=piste.boite,
                identifiant=self._lisseur.affiche(piste.identifiant),
                score=self._scores.get(piste.identifiant, 0.0),
            )
            for piste in self._suiveur.pistes()
        ]

    def _detecter(self, image) -> None:
        visages = self._detecteur.analyser(image)
        avant = {piste.identifiant for piste in self._suiveur.pistes()}
        associations = self._suiveur.mettre_a_jour([visage.bbox for visage in visages])
        apres = {piste.identifiant for piste in self._suiveur.pistes()}
        for disparue in avant - apres:
            self._lisseur.oublier(disparue)
            self._scores.pop(disparue, None)

        for piste, index in associations:
            resultat = self._galerie.reconnaitre(visages[index].embedding, self._seuil)
            self._lisseur.ajouter(piste.identifiant, resultat.identifiant)
            self._scores[piste.identifiant] = resultat.score
