"""Application web locale de démonstration (FastAPI).

- /            page de démo (flux vidéo à gauche, fiche client à droite)
- /video       flux MJPEG de la caméra, avec un cadre autour des visages
- /evenements  mises à jour de l'état en direct (Server-Sent Events)
- /etat        état courant au format JSON

Lancement : python -m boutique.server, puis ouvrir http://localhost:8000
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections import deque
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .clients import Clients, FicheInvalide
from .config import FICHIER_CLIENTS, FICHIER_GALERIE, INDEX_CAMERA, MODELE, NOM_BOUTIQUE, SEUIL
from .gallery import Galerie
from .pipeline import Affichage, Pipeline
from .rendu import ecrire
from .suggest import suggerer

DOSSIER_STATIC = Path(__file__).resolve().parent / "static"
COULEUR_CONNU = (74, 146, 184)  # or, en BGR
COULEUR_INCONNU = (140, 140, 140)  # gris, en BGR
RECHARGEMENT_SECONDES = 2.0
ECHECS_CAMERA_AVANT_ERREUR = 30  # environ 1,5 s de lectures ratées avant de signaler la caméra en erreur
FENETRE_FPS = 30


class Etat:
    """État partagé entre la boucle caméra (thread) et les routes web."""

    def __init__(self):
        self._verrou = threading.Lock()
        self._jpeg: bytes | None = None
        self._donnees: dict = {
            "statut": "demarrage",
            "message": "Démarrage de la caméra...",
            "avertissement": "",
            "nom_boutique": NOM_BOUTIQUE,
            "fps": 0.0,
            "personne": None,
        }

    def publier_image(self, jpeg: bytes) -> None:
        with self._verrou:
            self._jpeg = jpeg

    def jpeg(self) -> bytes | None:
        with self._verrou:
            return self._jpeg

    def mettre_a_jour(self, **champs) -> None:
        with self._verrou:
            self._donnees.update(champs)

    def instantane(self) -> dict:
        with self._verrou:
            return dict(self._donnees)


def construire_personne(fiche: dict, maintenant: datetime) -> dict:
    """Champs de la fiche affichés au conseiller, plus la suggestion d'accueil."""
    return {
        "identifiant": fiche["identifiant"],
        "civilite": fiche["civilite"],
        "prenom": fiche["prenom"],
        "nom": fiche["nom"],
        "conseiller": fiche["conseiller"],
        "preferences": fiche["preferences"],
        "taille_vetement": fiche.get("taille_vetement"),
        "styles": fiche.get("styles", []),
        "cadeaux_notes": fiche.get("cadeaux_notes", []),
        "derniers_achats": fiche.get("derniers_achats", []),
        "notes": fiche.get("notes", ""),
        "prochain_rendez_vous": fiche.get("prochain_rendez_vous"),
        "suggestion": suggerer(fiche, maintenant),
    }


def personne_principale(affichages: list[Affichage], clients: Clients, maintenant: datetime) -> dict | None:
    """Le client reconnu dont le visage est le plus grand. None si personne n'est reconnu."""
    connus = [a for a in affichages if a.identifiant is not None and a.identifiant in clients]
    if not connus:
        return None
    plus_grand = max(connus, key=lambda a: (a.boite[2] - a.boite[0]) * (a.boite[3] - a.boite[1]))
    return construire_personne(clients.get(plus_grand.identifiant), maintenant)


def dessiner(image: np.ndarray, affichages: list[Affichage], clients: Clients, fps: float) -> np.ndarray:
    """Cadre par visage : le nom du client, ou « Inconnu » en gris. Une ligne en haut donne les fps
    et la meilleure similarité, pour le recalibrage du seuil (voir le README racine)."""
    ecran = image.copy()
    for affichage in affichages:
        x1, y1, x2, y2 = (int(v) for v in affichage.boite)
        if affichage.identifiant in clients:
            fiche = clients.get(affichage.identifiant)
            libelle = f"{fiche['prenom']} {fiche['nom']}"
            couleur = COULEUR_CONNU
        else:
            libelle = "Inconnu"
            couleur = COULEUR_INCONNU
        cv2.rectangle(ecran, (x1, y1), (x2, y2), couleur, 3)
        ecran = ecrire(ecran, libelle, (x1, max(0, y1 - 40)), taille=24, couleur=(255, 255, 255), fond=couleur)
    meilleure = max((a.score for a in affichages), default=None)
    similarite = "aucun visage" if meilleure is None else f"similarité {meilleure:.2f}"
    return ecrire(ecran, f"{fps:.1f} fps · {similarite} · seuil {SEUIL:.2f}", (12, 12), taille=20, fond=(0, 0, 0))


class BoucleCamera(threading.Thread):
    """Lit la caméra, fait tourner le pipeline et publie l'image et l'état."""

    def __init__(
        self,
        etat: Etat,
        fichier_clients: Path = FICHIER_CLIENTS,
        fichier_galerie: Path = FICHIER_GALERIE,
        index: int = INDEX_CAMERA,
        modele: str = MODELE,
        detecteur=None,
    ):
        super().__init__(daemon=True, name="boucle-camera")
        self._etat = etat
        self._fichier_clients = fichier_clients
        self._fichier_galerie = fichier_galerie
        self._index = index
        self._modele = modele
        self._detecteur = detecteur
        self._arret = threading.Event()

    def arreter(self) -> None:
        self._arret.set()

    def run(self) -> None:
        from .backend import Detecteur, PoidsAbsents

        # Chaque échec de démarrage est affiché à l'écran : le thread ne meurt jamais en silence.
        try:
            detecteur = self._detecteur or Detecteur(self._modele)
        except PoidsAbsents as erreur:
            self._etat.mettre_a_jour(statut="erreur", message=str(erreur))
            return
        except Exception as erreur:
            self._etat.mettre_a_jour(statut="erreur", message=f"Chargement du modèle impossible : {erreur}")
            return

        try:
            pipeline = Pipeline(detecteur, Galerie.charger(self._fichier_galerie))
            clients = Clients.charger(self._fichier_clients)
        except Exception as erreur:
            self._etat.mettre_a_jour(statut="erreur", message=f"Données illisibles : {erreur}")
            return

        capture = cv2.VideoCapture(self._index)
        if not capture.isOpened():
            self._etat.mettre_a_jour(
                statut="erreur",
                message=f"Caméra {self._index} introuvable. Vérifiez la webcam et INDEX_CAMERA dans config.py.",
            )
            return
        self._etat.mettre_a_jour(statut="ok", message="Caméra active")

        try:
            self._boucle(capture, pipeline, clients)
        except Exception as erreur:
            self._etat.mettre_a_jour(statut="erreur", message=f"Traitement interrompu : {erreur}", personne=None)
        finally:
            capture.release()

    def _boucle(self, capture: cv2.VideoCapture, pipeline: Pipeline, clients: Clients) -> None:
        instants: deque[float] = deque(maxlen=FENETRE_FPS)  # fps mesurés sur les 30 dernières images
        dernier_rechargement = 0.0
        echecs = 0
        while not self._arret.is_set():
            ok, image = capture.read()
            if not ok:
                echecs += 1
                if echecs == ECHECS_CAMERA_AVANT_ERREUR:
                    self._etat.mettre_a_jour(
                        statut="erreur", message="Caméra interrompue. Vérifiez la webcam.", personne=None
                    )
                time.sleep(0.05)
                continue
            if echecs >= ECHECS_CAMERA_AVANT_ERREUR:
                self._etat.mettre_a_jour(statut="ok", message="Caméra active")
            echecs = 0

            maintenant = time.monotonic()
            if maintenant - dernier_rechargement > RECHARGEMENT_SECONDES:
                dernier_rechargement = maintenant
                try:
                    clients = Clients.charger(self._fichier_clients)
                    pipeline.changer_galerie(Galerie.charger(self._fichier_galerie))
                    avertissement = ""
                except (FicheInvalide, KeyError, ValueError, OSError) as erreur:
                    # Une modification ratée ne doit pas arrêter la démo : on garde les dernières données valides.
                    avertissement = f"Rechargement impossible, dernières données conservées : {erreur}"
                self._etat.mettre_a_jour(avertissement=avertissement)

            affichages = pipeline.traiter(image)
            instants.append(maintenant)
            fps = (len(instants) - 1) / (instants[-1] - instants[0]) if len(instants) > 1 else 0.0

            ecran = dessiner(image, affichages, clients, fps)
            ok, jpeg = cv2.imencode(".jpg", ecran, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok:
                self._etat.publier_image(jpeg.tobytes())
            self._etat.mettre_a_jour(
                fps=round(fps, 1),
                personne=personne_principale(affichages, clients, datetime.now()),
            )


def _flux_mjpeg(etat: Etat) -> Iterator[bytes]:
    while True:
        jpeg = etat.jpeg()
        if jpeg is not None:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        time.sleep(1 / 20)


async def _evenements(etat: Etat) -> AsyncIterator[str]:
    dernier = None
    while True:
        donnees = json.dumps(etat.instantane(), ensure_ascii=False, default=str)
        if donnees != dernier:
            yield f"data: {donnees}\n\n"
            dernier = donnees
        await asyncio.sleep(0.4)


def creer_app(etat: Etat | None = None, demarrer_camera: bool = True, detecteur=None) -> FastAPI:
    etat = etat or Etat()

    @asynccontextmanager
    async def cycle_de_vie(_app: FastAPI):
        boucle = BoucleCamera(etat, detecteur=detecteur) if demarrer_camera else None
        if boucle is not None:
            boucle.start()
        yield
        if boucle is not None:
            boucle.arreter()

    app = FastAPI(title="Maison Test : démonstration", lifespan=cycle_de_vie)
    app.mount("/static", StaticFiles(directory=DOSSIER_STATIC), name="static")

    @app.get("/")
    def accueil():
        return FileResponse(DOSSIER_STATIC / "index.html")

    @app.get("/video")
    def video():
        return StreamingResponse(_flux_mjpeg(etat), media_type="multipart/x-mixed-replace; boundary=frame")

    @app.get("/etat")
    def lire_etat():
        return etat.instantane()

    @app.get("/evenements")
    def evenements():
        return StreamingResponse(_evenements(etat), media_type="text/event-stream")

    return app


def main() -> None:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="Démo locale : http://localhost:8000")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(creer_app(), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
