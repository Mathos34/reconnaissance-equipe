// Réglages de la démo. Un seul endroit à modifier pour recalibrer.

export const NOM_BOUTIQUE = "Maison Test";

// ONNX Runtime Web, version figée (publiée plus de deux semaines avant la mise en ligne).
export const URL_ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";

// Modèles buffalo_s d'InsightFace, copiés dans site/models/ (voir docs/DECISIONS.md, D-031).
export const URL_MODELE_DETECTION = "./models/det_500m.onnx";
export const URL_MODELE_RECONNAISSANCE = "./models/w600k_mbf.onnx";

// Détection : entrée carrée, comme le modèle SCRFD d'origine.
export const TAILLE_DETECTION = 640;
export const SEUIL_DETECTION = 0.5;
export const SEUIL_NMS = 0.4;

// Reconnaissance : similarité cosinus minimale pour reconnaître un client. À recalibrer sur place.
export const SEUIL = 0.35;

// Suivi et lissage (mêmes valeurs que la version Python).
export const K_DETECTION = 3;
export const SEUIL_IOU = 0.3;
export const ABSENCE_MAX = 5;
export const FENETRE_DECISION = 5;
export const VOTES_MIN = 3;

// Enrôlement : 25 images valides, 5 poses, mêmes critères que la version Python.
export const IMAGES_ENROLEMENT = 25;
export const SCORE_MIN_ENROLEMENT = 0.6;
export const LARGEUR_MIN_ENROLEMENT = 120;

// Clés de stockage navigateur.
export const CLE_BASE = "maison-test/v1";
