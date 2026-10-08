import pytest

import boutique.backend as backend
from boutique import bench


@pytest.fixture
def dossier_vide(tmp_path, monkeypatch):
    """Simule une machine sans aucun poids InsightFace."""
    monkeypatch.setattr(backend, "DOSSIER_INSIGHTFACE", tmp_path)
    return tmp_path


def test_poids_absents_quand_le_dossier_manque(dossier_vide):
    assert backend.poids_presents("buffalo_s") is False


def test_poids_presents_quand_deux_fichiers_onnx_existent(dossier_vide):
    dossier = dossier_vide / "models" / "buffalo_s"
    dossier.mkdir(parents=True)
    (dossier / "det_500m.onnx").write_bytes(b"")
    (dossier / "w600k_mbf.onnx").write_bytes(b"")
    assert backend.poids_presents("buffalo_s") is True


def test_detecteur_refuse_de_telecharger_sans_demande_explicite(dossier_vide):
    with pytest.raises(backend.PoidsAbsents, match="--telecharger"):
        backend.Detecteur("buffalo_s")


def test_modele_inconnu_refuse(dossier_vide):
    with pytest.raises(ValueError):
        backend.Detecteur("buffalo_xl")


def test_bench_marque_le_modele_non_mesure_sans_rien_charger(dossier_vide):
    resultat = bench.mesurer("buffalo_l", source="synthetique", nombre=3)
    assert resultat["statut"].startswith("non mesuré")


def test_ctx_id_cpu_sans_cuda(monkeypatch):
    import onnxruntime

    monkeypatch.setattr(onnxruntime, "get_available_providers", lambda: ["AzureExecutionProvider", "CPUExecutionProvider"])
    assert backend.choisir_ctx_id() == -1


def test_ctx_id_gpu_si_cuda_disponible(monkeypatch):
    import onnxruntime

    monkeypatch.setattr(onnxruntime, "get_available_providers", lambda: ["CUDAExecutionProvider", "CPUExecutionProvider"])
    assert backend.choisir_ctx_id() == 0


def test_visage_calcule_sa_largeur():
    import numpy as np

    visage = backend.Visage(bbox=(10.0, 20.0, 130.0, 240.0), score=0.9, embedding=np.zeros(512, np.float32))
    assert visage.largeur == 120.0
