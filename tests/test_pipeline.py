from boutique.decision import Lisseur
from boutique.gallery import Galerie
from boutique.pipeline import Pipeline

from conftest import vecteur, visage

BOITE = (100.0, 100.0, 300.0, 320.0)


class DetecteurFictif:
    """Renvoie toujours les mêmes visages et compte les appels : sans caméra ni modèle."""

    def __init__(self, visages):
        self._visages = visages
        self.appels = 0

    def analyser(self, _image):
        self.appels += 1
        return list(self._visages)


def test_detection_seulement_une_image_sur_k():
    detecteur = DetecteurFictif([visage(vecteur(1), bbox=BOITE)])
    pipeline = Pipeline(detecteur, Galerie(), k=3)
    for _ in range(7):
        pipeline.traiter(None)
    assert detecteur.appels == 3  # images 0, 3 et 6


def test_identite_affichee_apres_trois_decisions_concordantes():
    galerie = Galerie({"C001": vecteur(1)})
    detecteur = DetecteurFictif([visage(vecteur(1), bbox=BOITE)])
    pipeline = Pipeline(detecteur, galerie, k=1)
    assert pipeline.traiter(None)[0].identifiant is None
    pipeline.traiter(None)
    affichages = pipeline.traiter(None)
    assert affichages[0].identifiant == "C001"
    assert affichages[0].score > 0.99


def test_entre_deux_detections_la_piste_garde_son_identite():
    galerie = Galerie({"C001": vecteur(1)})
    detecteur = DetecteurFictif([visage(vecteur(1), bbox=BOITE)])
    pipeline = Pipeline(detecteur, galerie, k=3)
    for _ in range(9):
        dernier = pipeline.traiter(None)
    assert dernier[0].identifiant == "C001"
    assert detecteur.appels == 3


def test_visage_inconnu_reste_inconnu_et_rien_n_est_ajoute_a_la_galerie():
    galerie = Galerie({"C001": vecteur(1)})
    detecteur = DetecteurFictif([visage(vecteur(99), bbox=BOITE)])
    pipeline = Pipeline(detecteur, galerie, k=1)
    for _ in range(5):
        affichages = pipeline.traiter(None)
    assert affichages[0].identifiant is None
    assert galerie.identifiants() == ["C001"]


def test_changer_galerie_prend_effet_au_prochain_calcul():
    detecteur = DetecteurFictif([visage(vecteur(1), bbox=BOITE)])
    pipeline = Pipeline(detecteur, Galerie(), k=1)
    for _ in range(3):
        pipeline.traiter(None)
    assert pipeline.traiter(None)[0].identifiant is None
    pipeline.changer_galerie(Galerie({"C002": vecteur(1)}))
    for _ in range(3):
        affichages = pipeline.traiter(None)
    assert affichages[0].identifiant == "C002"


def test_piste_disparue_est_oubliee_du_lissage():
    galerie = Galerie({"C001": vecteur(1)})
    detecteur = DetecteurFictif([visage(vecteur(1), bbox=BOITE)])
    lisseur = Lisseur()
    pipeline = Pipeline(detecteur, galerie, k=1, lisseur=lisseur)
    for _ in range(3):
        pipeline.traiter(None)
    assert lisseur.pistes_suivies() == [1]
    detecteur._visages = []
    for _ in range(10):
        affichages = pipeline.traiter(None)
    assert affichages == []
    assert lisseur.pistes_suivies() == []
