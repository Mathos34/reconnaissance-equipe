import pytest

from boutique.tracker import Suiveur, iou

A = (0.0, 0.0, 100.0, 100.0)
DECALE = (10.0, 5.0, 110.0, 105.0)
LOIN = (500.0, 500.0, 600.0, 600.0)


def test_iou_boites_identiques_et_disjointes():
    assert iou(A, A) == pytest.approx(1.0)
    assert iou(A, LOIN) == 0.0


def test_iou_recouvrement_partiel():
    # intersection 50 x 100 = 5000, union 10000 + 10000 - 5000 = 15000
    assert iou((0, 0, 100, 100), (50, 0, 150, 100)) == pytest.approx(1 / 3)


def test_meme_visage_garde_le_meme_identifiant_entre_deux_detections():
    suiveur = Suiveur()
    (piste_1, _), = suiveur.mettre_a_jour([A])
    (piste_2, _), = suiveur.mettre_a_jour([DECALE])
    assert piste_1.identifiant == piste_2.identifiant
    assert piste_2.boite == DECALE


def test_deux_visages_eloignes_ont_deux_pistes_distinctes():
    suiveur = Suiveur()
    associations = suiveur.mettre_a_jour([A, LOIN])
    identifiants = {piste.identifiant for piste, _ in associations}
    assert len(identifiants) == 2


def test_une_piste_ne_peut_correspondre_qu_a_une_boite():
    suiveur = Suiveur()
    suiveur.mettre_a_jour([A])
    associations = suiveur.mettre_a_jour([A, DECALE])
    assert len(suiveur.pistes()) == 2
    identifiants = [piste.identifiant for piste, _ in associations]
    assert len(set(identifiants)) == 2


def test_piste_absente_trop_longtemps_est_oubliee():
    suiveur = Suiveur(absence_max=2)
    suiveur.mettre_a_jour([A])
    suiveur.mettre_a_jour([])
    suiveur.mettre_a_jour([])
    assert len(suiveur.pistes()) == 1
    suiveur.mettre_a_jour([])
    assert suiveur.pistes() == []


def test_identifiant_nouveau_quand_le_visage_revient_apres_oubli():
    suiveur = Suiveur(absence_max=0)
    (premiere, _), = suiveur.mettre_a_jour([A])
    suiveur.mettre_a_jour([])
    (seconde, _), = suiveur.mettre_a_jour([A])
    assert seconde.identifiant != premiere.identifiant
