"""Lissage des décisions par piste.

Un client n'est affiché que si VOTES_MIN décisions sur les FENETRE dernières concordent.
Les décisions "inconnu" (None) ne comptent pour aucun client.
"""

from __future__ import annotations

from collections import Counter, deque

from .config import FENETRE_DECISION, VOTES_MIN


class Lisseur:
    def __init__(self, fenetre: int = FENETRE_DECISION, votes_min: int = VOTES_MIN):
        if votes_min > fenetre:
            raise ValueError("votes_min ne peut pas dépasser la taille de la fenêtre")
        self._fenetre = fenetre
        self._votes_min = votes_min
        self._historiques: dict[int, deque[str | None]] = {}

    def ajouter(self, piste_id: int, identifiant: str | None) -> str | None:
        """Enregistre une décision pour une piste et renvoie ce qu'il faut afficher."""
        historique = self._historiques.setdefault(piste_id, deque(maxlen=self._fenetre))
        historique.append(identifiant)
        return self.affiche(piste_id)

    def affiche(self, piste_id: int) -> str | None:
        historique = self._historiques.get(piste_id)
        if not historique:
            return None
        compte = Counter(i for i in historique if i is not None)
        if not compte:
            return None
        identifiant, votes = compte.most_common(1)[0]
        return identifiant if votes >= self._votes_min else None

    def oublier(self, piste_id: int) -> None:
        self._historiques.pop(piste_id, None)

    def pistes_suivies(self) -> list[int]:
        """Pistes dont l'historique est encore en mémoire."""
        return list(self._historiques)
