"""Réglages de la démo. Les valeurs à recalibrer sont regroupées ici."""

from pathlib import Path

NOM_BOUTIQUE = "Maison Test"

RACINE = Path(__file__).resolve().parents[2]
DOSSIER_DATA = RACINE / "data"
FICHIER_CLIENTS = DOSSIER_DATA / "clients.json"
FICHIER_GALERIE = DOSSIER_DATA / "gallery.npz"

# Modèle InsightFace : "buffalo_s" (~159 Mo, par défaut) ou "buffalo_l" (~326 Mo, plus précis, plus lent).
# Choix lié à la machine de démo : Ryzen 7 5800H (CPU seul pour ONNX Runtime, voir D-018) et 15 Go libres sur C:.
MODELE = "buffalo_s"
INDEX_CAMERA = 0
FPS_CIBLE = 10

# Détection et embedding sur une image sur K. Le suiveur garde l'identité entre deux calculs.
K_DETECTION = 3
TAILLE_DETECTION = (640, 640)
SEUIL_DETECTION = 0.5

# Similarité cosinus minimale pour reconnaître un client. À recalibrer avec la caméra de la démo.
SEUIL = 0.35

# Suivi entre images : recouvrement minimal (IoU) et nombre de détections sans correspondance avant oubli
SEUIL_IOU = 0.3
ABSENCE_MAX = 5

# Lissage : un client est affiché si VOTES_MIN décisions sur les FENETRE dernières concordent
FENETRE_DECISION = 5
VOTES_MIN = 3

# Enrôlement
IMAGES_ENROLEMENT = 25
SCORE_MIN_ENROLEMENT = 0.6
LARGEUR_MIN_ENROLEMENT = 120
