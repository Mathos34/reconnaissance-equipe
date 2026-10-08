import numpy as np
import pytest

from boutique.clients import Clients
from boutique.enroll import (
    IMAGES_PAR_POSE,
    EnrolementIncomplet,
    collecter,
    consigne_pour,
    enroler,
    image_valide,
    supprimer,
)
from boutique.gallery import Galerie

from conftest import vecteur, visage


def reponses(*textes):
    """Remplace input() : renvoie les textes dans l'ordre, puis échoue si on demande trop de saisies."""
    file = list(textes)

    def saisie(_invite):
        if not file:
            raise AssertionError("Saisie inattendue")
        return file.pop(0)

    return saisie


def source_fictive(nombre_visages_par_image=1, embedding=None, score=0.9, largeur=200.0):
    """Source de test : un flux d'images factices, sans caméra ni modèle."""
    emb = vecteur(7) if embedding is None else embedding

    def flux():
        while True:
            bbox = (0.0, 0.0, largeur, largeur + 20)
            yield None, [visage(emb, score=score, bbox=bbox) for _ in range(nombre_visages_par_image)]

    return lambda: (flux(), None, None)


def test_image_avec_deux_visages_refusee():
    assert image_valide([visage(vecteur(1)), visage(vecteur(2))]) is None


def test_image_sans_visage_refusee():
    assert image_valide([]) is None


def test_score_sous_0_6_refuse_et_0_6_accepte():
    assert image_valide([visage(vecteur(1), score=0.59)]) is None
    assert image_valide([visage(vecteur(1), score=0.6)]) is not None


def test_largeur_sous_120_pixels_refusee():
    assert image_valide([visage(vecteur(1), bbox=(0.0, 0.0, 119.0, 200.0))]) is None
    assert image_valide([visage(vecteur(1), bbox=(0.0, 0.0, 120.0, 200.0))]) is not None


def test_consignes_changent_toutes_les_cinq_images():
    assert IMAGES_PAR_POSE == 5
    assert consigne_pour(0) == "Regardez la caméra"
    assert consigne_pour(5) == "Tournez doucement la tête vers votre gauche"
    assert consigne_pour(24) == "Baissez légèrement la tête"


def test_collecter_ignore_les_images_invalides_et_s_arrete_a_25():
    bonne = [visage(vecteur(3))]
    mauvaise = [visage(vecteur(4), score=0.2)]
    flux = [(None, mauvaise if i % 2 else bonne) for i in range(200)]
    embeddings = collecter(flux, total=25)
    assert len(embeddings) == 25
    # Seules les images valides (embedding 3) doivent être gardées : un embedding 4 trahirait un filtre absent.
    for embedding in embeddings:
        assert float(embedding @ vecteur(3)) == pytest.approx(1.0, abs=1e-5)


def test_echec_d_ecriture_de_la_fiche_n_active_pas_le_gabarit(fichier_clients, fichier_galerie, monkeypatch):
    def echec(self, chemin):
        raise OSError("disque plein")

    monkeypatch.setattr(Clients, "sauver", echec)
    with pytest.raises(OSError):
        enroler(
            "C001",
            fichier_clients=fichier_clients,
            fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"),
            source=source_fictive(),
        )
    assert not fichier_galerie.exists()


def test_collecter_signale_un_flux_trop_court():
    flux = [(None, [visage(vecteur(3))]) for _ in range(3)]
    with pytest.raises(EnrolementIncomplet) as erreur:
        collecter(flux, total=25)
    assert erreur.value.recues == 3


def test_identifiant_inconnu_arrete_avec_un_message_et_rien_n_est_ecrit(tmp_path):
    code = enroler(
        "C999",
        fichier_clients=tmp_path / "clients.json",
        fichier_galerie=tmp_path / "gallery.npz",
        saisie=reponses("J'ACCEPTE"),
        source=source_fictive(),
    )
    assert code == 1
    assert not (tmp_path / "gallery.npz").exists()


def test_sans_la_mention_rien_n_est_enregistre(fichier_clients, fichier_galerie):
    avant = fichier_clients.read_bytes()
    code = enroler(
        "C001",
        fichier_clients=fichier_clients,
        fichier_galerie=fichier_galerie,
        saisie=reponses("oui, je suis d'accord"),
        source=source_fictive(),
    )
    assert code == 2
    assert not fichier_galerie.exists()
    assert fichier_clients.read_bytes() == avant


def test_mention_sans_source_de_capture_pas_appelee(fichier_clients, fichier_galerie):
    appels = []

    def source_espion():
        appels.append(True)
        return source_fictive()()

    enroler(
        "C001",
        fichier_clients=fichier_clients,
        fichier_galerie=fichier_galerie,
        saisie=reponses("non"),
        source=source_espion,
    )
    assert appels == []


def test_enrolement_avec_mention_enregistre_gabarit_et_date(fichier_clients, fichier_galerie):
    code = enroler(
        "C001",
        fichier_clients=fichier_clients,
        fichier_galerie=fichier_galerie,
        saisie=reponses("j'accepte"),
        source=source_fictive(embedding=vecteur(7)),
    )
    assert code == 0
    galerie = Galerie.charger(fichier_galerie)
    assert galerie.reconnaitre(vecteur(7), seuil=0.9).identifiant == "C001"
    consentement = Clients.charger(fichier_clients).get("C001")["consentement"]
    assert consentement["mention"] == "J'ACCEPTE"
    assert consentement["date"]


def test_apostrophe_typographique_acceptee(fichier_clients, fichier_galerie):
    code = enroler(
        "C002",
        fichier_clients=fichier_clients,
        fichier_galerie=fichier_galerie,
        saisie=reponses("J’ACCEPTE"),
        source=source_fictive(),
    )
    assert code == 0


def test_doublon_refuse_sans_update(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    code = enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
                   saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(8)))
    assert code == 1
    assert Galerie.charger(fichier_galerie).reconnaitre(vecteur(7), seuil=0.9).identifiant == "C001"


def test_update_sans_confirmation_ne_change_rien(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    code = enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
                   saisie=reponses("non"), source=source_fictive(embedding=vecteur(8)), mise_a_jour=True)
    assert code == 1
    assert Galerie.charger(fichier_galerie).reconnaitre(vecteur(7), seuil=0.9).identifiant == "C001"


def test_update_avec_confirmation_remplace_le_gabarit(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    code = enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
                   saisie=reponses("oui", "J'ACCEPTE"), source=source_fictive(embedding=vecteur(8)),
                   mise_a_jour=True)
    assert code == 0
    assert Galerie.charger(fichier_galerie).reconnaitre(vecteur(8), seuil=0.9).identifiant == "C001"


def test_capture_interrompue_n_enregistre_rien(fichier_clients, fichier_galerie):
    avant = fichier_clients.read_bytes()

    def source_courte():
        return iter([(None, [visage(vecteur(7))])]), None, None

    code = enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
                   saisie=reponses("J'ACCEPTE"), source=source_courte)
    assert code == 3
    assert not fichier_galerie.exists()
    assert fichier_clients.read_bytes() == avant


def test_camera_introuvable_arrete_proprement(fichier_clients, fichier_galerie):
    def source_absente():
        raise RuntimeError("Caméra 0 introuvable")

    code = enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
                   saisie=reponses("J'ACCEPTE"), source=source_absente)
    assert code == 3


def test_suppression_sans_confirmation_ne_fait_rien(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    code = supprimer("C001", purge=False, fichier_clients=fichier_clients,
                     fichier_galerie=fichier_galerie, saisie=reponses("oui"))
    assert code == 1
    assert "C001" in Galerie.charger(fichier_galerie)


def test_suppression_retire_le_gabarit_et_garde_la_fiche(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    code = supprimer("C001", purge=False, fichier_clients=fichier_clients,
                     fichier_galerie=fichier_galerie, saisie=reponses("SUPPRIMER"))
    assert code == 0
    assert "C001" not in Galerie.charger(fichier_galerie)
    assert "C001" in Clients.charger(fichier_clients)


def test_purge_retire_aussi_la_fiche(fichier_clients, fichier_galerie):
    enroler("C001", fichier_clients=fichier_clients, fichier_galerie=fichier_galerie,
            saisie=reponses("J'ACCEPTE"), source=source_fictive(embedding=vecteur(7)))
    supprimer("C001", purge=True, fichier_clients=fichier_clients,
              fichier_galerie=fichier_galerie, saisie=reponses("SUPPRIMER"))
    assert "C001" not in Galerie.charger(fichier_galerie)
    assert "C001" not in Clients.charger(fichier_clients)
    assert "C002" in Clients.charger(fichier_clients)
