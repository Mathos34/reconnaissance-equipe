"""Suggestion d'accueil selon les préférences de la fiche et l'heure.

Règles (détaillées dans src/boutique/README.md) :
- avant 12 h : la boisson préférée, dans la température enregistrée ;
- à partir de 12 h : la boisson préférée et un rappel de la dernière visite ;
- dans tous les cas : le sucre et le lait sont affichés pour que le conseiller confirme.
"""

from __future__ import annotations

from datetime import date, datetime

HEURE_BASCULE = 12


def _libelle_sucre(sucre) -> str:
    if sucre in ("non", 0):
        return "sans sucre"
    if sucre == 1:
        return "avec 1 morceau de sucre"
    return f"avec {sucre} morceaux de sucre"


def derniere_visite(fiche: dict) -> date | None:
    """Date du dernier achat enregistré, qui sert de dernière visite."""
    dates = [date.fromisoformat(achat["date"]) for achat in fiche.get("derniers_achats", [])]
    return max(dates) if dates else None


def suggerer(fiche: dict, maintenant: datetime) -> dict:
    preferences = fiche["preferences"]
    article = preferences.get("article", "un")
    boisson = f"{article} {preferences['boisson']}"
    formule = f"Bonjour {fiche['civilite']} {fiche['nom']}, {boisson} {_libelle_sucre(preferences['sucre'])}, comme d'habitude ?"

    apres_midi = maintenant.hour >= HEURE_BASCULE
    visite = derniere_visite(fiche)
    if apres_midi and visite is not None:
        formule += f" Dernière visite le {visite:%d/%m/%Y}."

    return {
        "accroche": formule,
        "boisson": boisson,
        "temperature": "chaude" if preferences["temperature"] == "chaud" else "froide",
        "sucre": _libelle_sucre(preferences["sucre"]),
        "lait": preferences["lait"],
        "moment": "apres_midi" if apres_midi else "matin",
        "derniere_visite": visite.strftime("%d/%m/%Y") if visite else None,
    }
