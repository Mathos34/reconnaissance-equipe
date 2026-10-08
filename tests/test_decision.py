import pytest

from boutique.decision import Lisseur


def test_il_faut_trois_decisions_concordantes_sur_cinq():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    assert lisseur.ajouter(1, "C001") is None
    assert lisseur.ajouter(1, "C001") is None
    assert lisseur.ajouter(1, "C001") == "C001"


def test_deux_votes_ne_suffisent_pas():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    lisseur.ajouter(1, "C001")
    lisseur.ajouter(1, "C002")
    lisseur.ajouter(1, "C001")
    assert lisseur.affiche(1) is None


def test_les_decisions_inconnues_ne_comptent_pour_aucun_client():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    for identifiant in ["C001", None, None, "C001"]:
        lisseur.ajouter(1, identifiant)
    assert lisseur.affiche(1) is None
    assert lisseur.ajouter(1, "C001") == "C001"


def test_la_fenetre_glisse_et_une_ancienne_decision_sort():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    for _ in range(3):
        lisseur.ajouter(1, "C001")
    assert lisseur.affiche(1) == "C001"
    for _ in range(5):
        lisseur.ajouter(1, "C002")
    assert lisseur.affiche(1) == "C002"


def test_chaque_piste_a_son_propre_historique():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    for _ in range(3):
        lisseur.ajouter(1, "C001")
    lisseur.ajouter(2, "C002")
    assert lisseur.affiche(1) == "C001"
    assert lisseur.affiche(2) is None


def test_oublier_efface_l_historique_de_la_piste():
    lisseur = Lisseur(fenetre=5, votes_min=3)
    for _ in range(3):
        lisseur.ajouter(1, "C001")
    lisseur.oublier(1)
    assert lisseur.affiche(1) is None


def test_votes_superieurs_a_la_fenetre_refuses():
    with pytest.raises(ValueError):
        Lisseur(fenetre=2, votes_min=3)
