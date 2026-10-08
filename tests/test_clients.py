import copy
import json
from datetime import datetime

import pytest

from boutique.clients import Clients, FicheInvalide, valider

from conftest import DEMO_CLIENTS


def fiche_valide() -> dict:
    return copy.deepcopy(json.loads(DEMO_CLIENTS.read_text(encoding="utf-8"))[0])


def test_les_fiches_de_demo_sont_valides_et_au_nombre_de_quatre():
    clients = Clients.charger(DEMO_CLIENTS)
    assert clients.identifiants() == ["C001", "C002", "C003", "C004"]


def test_champ_obligatoire_manquant_refuse():
    fiche = fiche_valide()
    del fiche["conseiller"]
    with pytest.raises(FicheInvalide, match="conseiller"):
        valider(fiche)


def test_temperature_inconnue_refusee():
    fiche = fiche_valide()
    fiche["preferences"]["temperature"] = "tiède"
    with pytest.raises(FicheInvalide, match="température"):
        valider(fiche)


@pytest.mark.parametrize("sucre", [-1, True, "deux"])
def test_sucre_invalide_refuse(sucre):
    fiche = fiche_valide()
    fiche["preferences"]["sucre"] = sucre
    with pytest.raises(FicheInvalide, match="sucre"):
        valider(fiche)


def test_identifiant_en_double_refuse():
    fiche = fiche_valide()
    with pytest.raises(FicheInvalide, match="double"):
        Clients([fiche, copy.deepcopy(fiche)])


def test_get_renvoie_une_copie():
    clients = Clients.charger(DEMO_CLIENTS)
    copie = clients.get("C001")
    copie["prenom"] = "Modifié"
    assert clients.get("C001")["prenom"] == "Claire"


def test_fiche_inconnue_renvoie_none():
    assert Clients.charger(DEMO_CLIENTS).get("C999") is None


def test_fichier_absent_donne_un_ensemble_vide(tmp_path):
    assert Clients.charger(tmp_path / "absent.json").identifiants() == []


def test_sauver_puis_charger_conserve_les_accents(tmp_path):
    chemin = tmp_path / "clients.json"
    clients = Clients.charger(DEMO_CLIENTS)
    clients.sauver(chemin)
    relu = Clients.charger(chemin)
    assert relu.get("C003")["cadeaux_notes"] == ["écharpe cachemire ivoire"]
    assert relu.identifiants() == clients.identifiants()


def test_consentement_enregistre_la_date_et_la_mention():
    clients = Clients.charger(DEMO_CLIENTS)
    clients.enregistrer_consentement("C002", datetime(2026, 10, 8, 9, 30, 0))
    consentement = clients.get("C002")["consentement"]
    assert consentement == {"date": "2026-10-08T09:30:00", "mention": "J'ACCEPTE"}


def test_supprimer_retire_la_fiche():
    clients = Clients.charger(DEMO_CLIENTS)
    clients.supprimer("C004")
    assert "C004" not in clients
