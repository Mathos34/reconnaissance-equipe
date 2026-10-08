"""Enrôlement d'un client fictif : consentement tapé, capture, gabarit, liaison à la fiche.

Commandes (depuis la racine du projet) :
  python -m boutique.enroll --client C001               enrôlement
  python -m boutique.enroll --client C001 --update      remplace le gabarit existant, après confirmation
  python -m boutique.enroll --delete C001               retire le gabarit, la fiche reste
  python -m boutique.enroll --delete C001 --purge       retire le gabarit et la fiche

Rien n'est enregistré sans la mention "J'ACCEPTE" tapée au clavier.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from .backend import Visage
from .clients import Clients
from .config import (
    FICHIER_CLIENTS,
    FICHIER_GALERIE,
    IMAGES_ENROLEMENT,
    INDEX_CAMERA,
    LARGEUR_MIN_ENROLEMENT,
    MODELE,
    SCORE_MIN_ENROLEMENT,
)
from .gallery import Galerie, construire_gabarit

POSES = (
    ("face", "Regardez la caméra"),
    ("gauche", "Tournez doucement la tête vers votre gauche"),
    ("droite", "Tournez doucement la tête vers votre droite"),
    ("haut", "Levez légèrement le menton"),
    ("bas", "Baissez légèrement la tête"),
)
IMAGES_PAR_POSE = IMAGES_ENROLEMENT // len(POSES)
IMAGES_MAX_FLUX = 600  # environ une minute de capture, pour ne jamais boucler indéfiniment
MENTION = "J'ACCEPTE"
MOT_SUPPRESSION = "SUPPRIMER"

if IMAGES_ENROLEMENT % len(POSES) != 0:
    raise ValueError("IMAGES_ENROLEMENT doit être un multiple du nombre de poses")

Source = Callable[[], tuple[Iterable[tuple[Any, list[Visage]]], Callable | None, Callable | None]]


class EnrolementIncomplet(RuntimeError):
    def __init__(self, recues: int, total: int):
        super().__init__(f"{recues} images valides sur {total}")
        self.recues = recues
        self.total = total


def consigne_pour(nb_valides: int) -> str:
    """Consigne affichée selon le nombre d'images déjà retenues : 5 images par pose."""
    index = min(nb_valides // IMAGES_PAR_POSE, len(POSES) - 1)
    return POSES[index][1]


def image_valide(visages: list[Visage]) -> Visage | None:
    """Une image n'est retenue que si elle contient un seul visage, assez net et assez grand."""
    if len(visages) != 1:
        return None
    visage = visages[0]
    if visage.score < SCORE_MIN_ENROLEMENT or visage.largeur < LARGEUR_MIN_ENROLEMENT:
        return None
    return visage


def collecter(
    flux: Iterable[tuple[Any, list[Visage]]],
    afficher: Callable[[Any, int, int, bool], bool] | None = None,
    total: int = IMAGES_ENROLEMENT,
) -> list[np.ndarray]:
    """Consomme le flux jusqu'à obtenir `total` images valides, et renvoie leurs embeddings.

    `afficher` reçoit (image, nombre retenu, total, image retenue) et renvoie False pour arrêter.
    """
    embeddings: list[np.ndarray] = []
    for image, visages in flux:
        retenu = image_valide(visages)
        if retenu is not None:
            embeddings.append(retenu.embedding)
        if afficher is not None and afficher(image, len(embeddings), total, retenu is not None) is False:
            break
        if len(embeddings) >= total:
            break
    if len(embeddings) < total:
        raise EnrolementIncomplet(len(embeddings), total)
    return embeddings


def _reponse_ok(saisie: str, attendu: str) -> bool:
    return saisie.strip().replace("’", "'").casefold() == attendu.casefold()


def enroler(
    identifiant: str,
    *,
    fichier_clients: Path,
    fichier_galerie: Path,
    saisie: Callable[[str], str] = input,
    source: Source | None = None,
    mise_a_jour: bool = False,
    maintenant: datetime | None = None,
) -> int:
    """Enrôle un client. Renvoie un code de sortie (0 = succès)."""
    clients = Clients.charger(fichier_clients)
    if identifiant not in clients:
        print(f"La fiche {identifiant} n'existe pas dans {fichier_clients}. Créez-la d'abord (voir demo/PROCEDURE.md).")
        return 1

    galerie = Galerie.charger(fichier_galerie)
    if identifiant in galerie:
        if not mise_a_jour:
            print(f"{identifiant} est déjà enrôlé. Utilisez --update pour remplacer son gabarit.")
            return 1
        if not _reponse_ok(saisie(f"Le gabarit de {identifiant} sera remplacé. Tapez oui pour confirmer : "), "oui"):
            print("Mise à jour annulée. Rien n'a été modifié.")
            return 1

    if not _reponse_ok(saisie(f"Tapez {MENTION} pour confirmer que la personne accepte l'enrôlement : "), MENTION):
        print("Enrôlement annulé : la mention n'a pas été tapée. Rien n'a été enregistré.")
        return 2

    try:
        flux, afficher, fermer = (source or ouvrir_camera)()
    except RuntimeError as erreur:
        print(f"Enrôlement impossible : {erreur}. Rien n'a été enregistré.")
        return 3
    try:
        embeddings = collecter(flux, afficher)
    except EnrolementIncomplet as erreur:
        print(f"Enrôlement interrompu ({erreur}). Rien n'a été enregistré.")
        return 3
    finally:
        if fermer is not None:
            fermer()

    # Le consentement est écrit avant le gabarit : si une écriture échoue, le gabarit n'est jamais
    # actif sans consentement noté. Un nouvel enrôlement reste possible, car il n'y a alors pas de doublon.
    clients.enregistrer_consentement(identifiant, maintenant or datetime.now())
    clients.sauver(fichier_clients)
    galerie.enroler(identifiant, construire_gabarit(embeddings))
    galerie.sauver(fichier_galerie)
    print(f"{identifiant} est enrôlé : {len(embeddings)} images retenues, gabarit enregistré.")
    return 0


def supprimer(
    identifiant: str,
    *,
    purge: bool,
    fichier_clients: Path,
    fichier_galerie: Path,
    saisie: Callable[[str], str] = input,
) -> int:
    clients = Clients.charger(fichier_clients)
    galerie = Galerie.charger(fichier_galerie)
    if identifiant not in clients and identifiant not in galerie:
        print(f"Rien à supprimer pour {identifiant}.")
        return 1

    action = "retirer le gabarit et la fiche" if purge else "retirer le gabarit (la fiche reste)"
    if saisie(f"Pour {action} de {identifiant}, tapez {MOT_SUPPRESSION} : ").strip() != MOT_SUPPRESSION:
        print("Suppression annulée. Rien n'a été modifié.")
        return 1

    if galerie.supprimer(identifiant):
        galerie.sauver(fichier_galerie)
        print(f"Gabarit de {identifiant} retiré.")
    if purge and identifiant in clients:
        clients.supprimer(identifiant)
        clients.sauver(fichier_clients)
        print(f"Fiche {identifiant} supprimée.")
    return 0


def ouvrir_camera(modele: str = MODELE, index: int = INDEX_CAMERA):
    """Source réelle : caméra OpenCV, détection InsightFace, consigne affichée à l'écran.

    Renvoie (flux, afficher, fermer). Les images ne sont jamais écrites sur le disque.
    """
    import cv2

    from .backend import Detecteur
    from .rendu import ecrire

    detecteur = Detecteur(modele)
    capture = cv2.VideoCapture(index)
    if not capture.isOpened():
        raise RuntimeError(f"Caméra {index} introuvable")
    fenetre = "Enrôlement"

    def flux():
        for _ in range(IMAGES_MAX_FLUX):
            ok, image = capture.read()
            if not ok:
                return
            yield image, detecteur.analyser(image)

    def afficher(image, nb_valides: int, total: int, retenue: bool) -> bool:
        ecran = ecrire(image, consigne_pour(nb_valides), (30, 30), taille=36, couleur=(230, 240, 250), fond=(40, 30, 25))
        etat = "Image retenue" if retenue else "Image non retenue (visage absent, plusieurs visages ou trop petit)"
        ecran = ecrire(ecran, f"{nb_valides}/{total} images valides. {etat}", (30, 100), taille=22)
        ecran = ecrire(ecran, "Échap pour annuler", (30, ecran.shape[0] - 50), taille=20)
        cv2.imshow(fenetre, ecran)
        return cv2.waitKey(1) & 0xFF != 27

    def fermer() -> None:
        capture.release()
        cv2.destroyWindow(fenetre)

    return flux(), afficher, fermer


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enrôlement, mise à jour et suppression des gabarits clients.")
    parser.add_argument("--client", help="Identifiant de la fiche à enrôler, par exemple C001")
    parser.add_argument("--update", action="store_true", help="Remplace le gabarit existant, après confirmation")
    parser.add_argument("--delete", metavar="ID", help="Retire le gabarit de ce client")
    parser.add_argument("--purge", action="store_true", help="Avec --delete : retire aussi la fiche")
    args = parser.parse_args(argv)

    if args.delete and args.client:
        parser.error("--client et --delete ne s'utilisent pas ensemble")
    if args.purge and not args.delete:
        parser.error("--purge ne s'utilise qu'avec --delete")

    if args.delete:
        return supprimer(
            args.delete,
            purge=args.purge,
            fichier_clients=FICHIER_CLIENTS,
            fichier_galerie=FICHIER_GALERIE,
        )
    if not args.client:
        parser.error("indiquer --client ID ou --delete ID")
    return enroler(
        args.client,
        fichier_clients=FICHIER_CLIENTS,
        fichier_galerie=FICHIER_GALERIE,
        mise_a_jour=args.update,
    )


if __name__ == "__main__":
    raise SystemExit(main())
