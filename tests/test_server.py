from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from boutique.clients import Clients
from boutique.pipeline import Affichage
from boutique.server import Etat, creer_app, dessiner, personne_principale

from conftest import DEMO_CLIENTS


def test_page_d_accueil_et_fichiers_statiques_servis():
    client = TestClient(creer_app(demarrer_camera=False))
    page = client.get("/")
    assert page.status_code == 200
    assert "Maison Test" in page.text
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/style.css").status_code == 200


def test_etat_json_avant_le_demarrage_de_la_camera():
    client = TestClient(creer_app(demarrer_camera=False))
    etat = client.get("/etat").json()
    assert etat["statut"] == "demarrage"
    assert etat["personne"] is None
    assert etat["nom_boutique"] == "Maison Test"


def test_personne_principale_choisit_le_plus_grand_visage_connu():
    clients = Clients.charger(DEMO_CLIENTS)
    affichages = [
        Affichage(piste=1, boite=(0, 0, 50, 50), identifiant="C002", score=0.5),
        Affichage(piste=2, boite=(0, 0, 200, 200), identifiant="C001", score=0.6),
        Affichage(piste=3, boite=(0, 0, 400, 400), identifiant=None, score=0.1),
    ]
    personne = personne_principale(affichages, clients, datetime(2026, 10, 8, 9, 0))
    assert personne["identifiant"] == "C001"
    assert "similarite" not in personne
    assert personne["suggestion"]["accroche"].startswith("Bonjour Madame Test")


def test_personne_principale_none_si_personne_n_est_reconnue():
    clients = Clients.charger(DEMO_CLIENTS)
    affichages = [Affichage(piste=1, boite=(0, 0, 50, 50), identifiant=None, score=0.1)]
    assert personne_principale(affichages, clients, datetime(2026, 10, 8, 9, 0)) is None


def test_fiche_publiee_sans_le_consentement_brut():
    clients = Clients.charger(DEMO_CLIENTS)
    affichages = [Affichage(piste=1, boite=(0, 0, 50, 50), identifiant="C003", score=0.8)]
    personne = personne_principale(affichages, clients, datetime(2026, 10, 8, 16, 0))
    assert "consentement" not in personne
    assert personne["suggestion"]["moment"] == "apres_midi"


def test_dessin_ne_modifie_pas_l_image_d_origine():
    import numpy as np

    clients = Clients.charger(DEMO_CLIENTS)
    image = np.zeros((240, 320, 3), dtype=np.uint8)
    affichages = [Affichage(piste=1, boite=(10, 60, 120, 200), identifiant="C001", score=0.7)]
    ecran = dessiner(image, affichages, clients, fps=10.0)
    assert image.sum() == 0
    assert ecran.sum() > 0


def test_modele_qui_ne_se_charge_pas_est_signale_a_l_ecran():
    from boutique.server import BoucleCamera

    etat = Etat()
    BoucleCamera(etat, modele="buffalo_xl").run()
    donnees = etat.instantane()
    assert donnees["statut"] == "erreur"
    assert "Chargement du modèle impossible" in donnees["message"]


def test_camera_absente_est_signalee_sans_arreter_l_application():
    from boutique.server import BoucleCamera

    class DetecteurFictif:
        def analyser(self, _image):
            return []

    etat = Etat()
    BoucleCamera(
        etat,
        fichier_clients=DEMO_CLIENTS,
        fichier_galerie=Path("galerie_absente_pour_le_test.npz"),
        index=98,
        detecteur=DetecteurFictif(),
    ).run()
    donnees = etat.instantane()
    assert donnees["statut"] == "erreur"
    assert "introuvable" in donnees["message"]


def test_etat_partage_est_lu_par_la_route():
    etat = Etat()
    etat.mettre_a_jour(statut="erreur", message="Caméra absente")
    client = TestClient(creer_app(etat=etat, demarrer_camera=False))
    assert client.get("/etat").json()["message"] == "Caméra absente"
