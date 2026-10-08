"""Lecture et mise à jour des fiches clients fictives (data/clients.json).

Le fichier contient une liste de fiches. Chaque fiche a un identifiant unique.
"""

from __future__ import annotations

import copy
import json
import os
from datetime import datetime
from pathlib import Path

CHAMPS_OBLIGATOIRES = ("identifiant", "civilite", "prenom", "nom", "conseiller", "preferences")
CHAMPS_PREFERENCES = ("boisson", "temperature", "sucre", "lait")
TEMPERATURES = ("chaud", "froid")


class FicheInvalide(ValueError):
    """Une fiche ne respecte pas le schéma attendu."""


def valider(fiche: dict) -> None:
    identifiant = fiche.get("identifiant", "?")
    manquants = [c for c in CHAMPS_OBLIGATOIRES if c not in fiche]
    if manquants:
        raise FicheInvalide(f"Fiche {identifiant} : champs manquants {manquants}")

    preferences = fiche["preferences"]
    manquants = [c for c in CHAMPS_PREFERENCES if c not in preferences]
    if manquants:
        raise FicheInvalide(f"Fiche {identifiant} : préférences manquantes {manquants}")
    if preferences["temperature"] not in TEMPERATURES:
        raise FicheInvalide(f"Fiche {identifiant} : température inconnue {preferences['temperature']!r}")

    sucre = preferences["sucre"]
    sucre_valide = sucre == "non" or (isinstance(sucre, int) and not isinstance(sucre, bool) and sucre >= 0)
    if not sucre_valide:
        raise FicheInvalide(f"Fiche {identifiant} : sucre doit valoir 'non' ou un nombre de morceaux")


class Clients:
    """Ensemble des fiches, indexées par identifiant."""

    def __init__(self, fiches: list[dict] | None = None):
        self._fiches: dict[str, dict] = {}
        for fiche in fiches or []:
            valider(fiche)
            identifiant = fiche["identifiant"]
            if identifiant in self._fiches:
                raise FicheInvalide(f"Identifiant en double : {identifiant}")
            self._fiches[identifiant] = fiche

    @classmethod
    def charger(cls, chemin: Path) -> "Clients":
        """Charge le fichier. S'il n'existe pas encore, renvoie un ensemble vide."""
        if not chemin.exists():
            return cls()
        return cls(json.loads(chemin.read_text(encoding="utf-8")))

    def sauver(self, chemin: Path) -> None:
        """Écrit le fichier via un fichier temporaire pour ne jamais le laisser à moitié écrit."""
        chemin.parent.mkdir(parents=True, exist_ok=True)
        temporaire = chemin.with_suffix(".tmp")
        contenu = json.dumps(list(self._fiches.values()), ensure_ascii=False, indent=2)
        temporaire.write_text(contenu + "\n", encoding="utf-8")
        os.replace(temporaire, chemin)

    def get(self, identifiant: str) -> dict | None:
        """Renvoie une copie de la fiche, pour que l'appelant ne modifie pas l'ensemble par accident."""
        fiche = self._fiches.get(identifiant)
        return copy.deepcopy(fiche) if fiche is not None else None

    def __contains__(self, identifiant: str) -> bool:
        return identifiant in self._fiches

    def identifiants(self) -> list[str]:
        return list(self._fiches)

    def enregistrer_consentement(self, identifiant: str, horodatage: datetime) -> None:
        """Note la date de l'acceptation "J'ACCEPTE" dans la fiche."""
        self._fiches[identifiant]["consentement"] = {
            "date": horodatage.isoformat(timespec="seconds"),
            "mention": "J'ACCEPTE",
        }

    def supprimer(self, identifiant: str) -> None:
        self._fiches.pop(identifiant, None)
