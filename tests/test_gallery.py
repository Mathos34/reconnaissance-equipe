import numpy as np
import pytest

from boutique.gallery import Galerie, construire_gabarit, normaliser

from conftest import vecteur


def test_gabarit_est_unitaire_et_proche_de_la_moyenne():
    base = vecteur(1)
    bruits = [base + 0.05 * vecteur(i + 10) for i in range(5)]
    gabarit = construire_gabarit(bruits)
    assert np.linalg.norm(gabarit) == pytest.approx(1.0, abs=1e-5)
    assert float(gabarit @ base) > 0.98


def test_gabarit_sans_embedding_refuse():
    with pytest.raises(ValueError):
        construire_gabarit([])


def test_vecteur_nul_refuse():
    with pytest.raises(ValueError):
        normaliser(np.zeros(512))


def test_reconnaissance_au_dessus_du_seuil():
    galerie = Galerie({"C001": vecteur(1), "C002": vecteur(2)})
    resultat = galerie.reconnaitre(vecteur(2) * 1.0, seuil=0.35)
    assert resultat.identifiant == "C002"
    assert resultat.score == pytest.approx(1.0, abs=1e-5)


def test_visage_inconnu_sous_le_seuil_donne_aucun_identifiant():
    galerie = Galerie({"C001": vecteur(1)})
    resultat = galerie.reconnaitre(vecteur(99), seuil=0.35)
    assert resultat.identifiant is None
    assert abs(resultat.score) < 0.35


def test_galerie_vide_ne_reconnait_personne():
    resultat = Galerie().reconnaitre(vecteur(1), seuil=0.35)
    assert resultat.identifiant is None
    assert resultat.score == 0.0


def test_sauver_puis_charger(fichier_galerie):
    galerie = Galerie({"C001": vecteur(1), "C004": vecteur(4)})
    galerie.sauver(fichier_galerie)
    relue = Galerie.charger(fichier_galerie)
    assert relue.identifiants() == ["C001", "C004"]
    assert relue.reconnaitre(vecteur(4), seuil=0.9).identifiant == "C004"


def test_galerie_vide_sauvegardee_puis_relue(fichier_galerie):
    Galerie().sauver(fichier_galerie)
    assert Galerie.charger(fichier_galerie).identifiants() == []


def test_supprimer_indique_si_le_gabarit_existait():
    galerie = Galerie({"C001": vecteur(1)})
    assert galerie.supprimer("C001") is True
    assert galerie.supprimer("C001") is False
    assert "C001" not in galerie
