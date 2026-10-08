import copy
from datetime import datetime

from boutique.clients import Clients
from boutique.suggest import derniere_visite, suggerer

from conftest import DEMO_CLIENTS


def fiche(identifiant: str) -> dict:
    return copy.deepcopy(Clients.charger(DEMO_CLIENTS).get(identifiant))


def test_matin_propose_la_boisson_sans_rappel_de_visite():
    suggestion = suggerer(fiche("C001"), datetime(2026, 10, 8, 9, 15))
    assert suggestion["accroche"] == "Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ?"
    assert suggestion["moment"] == "matin"
    assert "Dernière visite" not in suggestion["accroche"]


def test_apres_midi_rappelle_la_derniere_visite():
    suggestion = suggerer(fiche("C001"), datetime(2026, 10, 8, 15, 0))
    assert suggestion["moment"] == "apres_midi"
    assert suggestion["accroche"].endswith("Dernière visite le 14/09/2026.")
    assert suggestion["derniere_visite"] == "14/09/2026"


def test_bascule_a_midi_pile_compte_comme_apres_midi():
    assert suggerer(fiche("C001"), datetime(2026, 10, 8, 12, 0))["moment"] == "apres_midi"
    assert suggerer(fiche("C001"), datetime(2026, 10, 8, 11, 59))["moment"] == "matin"


def test_sucre_et_lait_sont_toujours_affiches_pour_confirmation():
    for heure in (9, 15):
        suggestion = suggerer(fiche("C003"), datetime(2026, 10, 8, heure, 0))
        assert suggestion["sucre"] == "avec 1 morceau de sucre"
        assert suggestion["lait"] == "aucun"
        suggestion_lait = suggerer(fiche("C004"), datetime(2026, 10, 8, heure, 0))
        assert suggestion_lait["lait"] == "lait d'avoine"
        assert suggestion_lait["sucre"] == "avec 2 morceaux de sucre"


def test_zero_morceau_de_sucre_s_affiche_comme_sans_sucre():
    fiche_zero = fiche("C003")
    fiche_zero["preferences"]["sucre"] = 0
    assert suggerer(fiche_zero, datetime(2026, 10, 8, 9, 0))["sucre"] == "sans sucre"


def test_temperature_chaude_ou_froide():
    assert suggerer(fiche("C001"), datetime(2026, 10, 8, 9, 0))["temperature"] == "froide"
    assert suggerer(fiche("C002"), datetime(2026, 10, 8, 9, 0))["temperature"] == "chaude"


def test_sans_achat_pas_de_rappel_meme_l_apres_midi():
    sans_achat = fiche("C001")
    sans_achat["derniers_achats"] = []
    suggestion = suggerer(sans_achat, datetime(2026, 10, 8, 16, 0))
    assert suggestion["derniere_visite"] is None
    assert "Dernière visite" not in suggestion["accroche"]


def test_derniere_visite_prend_la_date_la_plus_recente_meme_si_la_liste_n_est_pas_triee():
    fiche_desordre = fiche("C001")
    fiche_desordre["derniers_achats"] = [
        {"date": "2026-06-18", "article": "Eau d'Ambre 50 ml", "montant": 165},
        {"date": "2026-09-30", "article": "Écharpe cachemire ivoire", "montant": 420},
        {"date": "2026-07-02", "article": "Carnet cuir", "montant": 85},
    ]
    assert derniere_visite(fiche_desordre).isoformat() == "2026-09-30"
    assert suggerer(fiche_desordre, datetime(2026, 10, 8, 16, 0))["derniere_visite"] == "30/09/2026"
