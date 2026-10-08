// Enrôlement : critères d'une image valide, consignes par pose, et progression vers 25 images.
// Mêmes règles que src/boutique/enroll.py.

import { IMAGES_ENROLEMENT, LARGEUR_MIN_ENROLEMENT, SCORE_MIN_ENROLEMENT } from "../config.js";
import { moyenneNormalisee } from "./gabarit.js";

export const POSES = [
  { cle: "face", consigne: "Regardez la caméra" },
  { cle: "gauche", consigne: "Tournez doucement la tête vers votre gauche" },
  { cle: "droite", consigne: "Tournez doucement la tête vers votre droite" },
  { cle: "haut", consigne: "Levez légèrement le menton" },
  { cle: "bas", consigne: "Baissez légèrement la tête" },
];

/**
 * Évalue une image à partir de ses visages détectés. Une image n'est retenue que si elle contient
 * un seul visage, avec un score d'au moins SCORE_MIN_ENROLEMENT et une largeur d'au moins LARGEUR_MIN_ENROLEMENT px.
 * Renvoie { visage, raison } : visage vaut null et raison explique le refus.
 */
export function evaluerImage(visages) {
  if (visages.length === 0) return { visage: null, raison: "Aucun visage détecté" };
  if (visages.length > 1) return { visage: null, raison: "Plusieurs visages : une seule personne à la fois" };
  const visage = visages[0];
  const largeur = visage.boite[2] - visage.boite[0];
  if (visage.score < SCORE_MIN_ENROLEMENT) return { visage: null, raison: "Image trop floue ou visage peu net" };
  if (largeur < LARGEUR_MIN_ENROLEMENT) return { visage: null, raison: "Visage trop petit : rapprochez-vous" };
  return { visage, raison: null };
}

/** Indice de la pose attendue, selon le nombre d'images déjà retenues (5 images par pose). */
export function indicePose(nombreRetenu, imagesParPose = IMAGES_ENROLEMENT / POSES.length) {
  return Math.min(Math.floor(nombreRetenu / imagesParPose), POSES.length - 1);
}

export class Enrolement {
  constructor({ cible = IMAGES_ENROLEMENT } = {}) {
    this._cible = cible;
    this._embeddings = [];
  }

  get nombre() {
    return this._embeddings.length;
  }

  get cible() {
    return this._cible;
  }

  get termine() {
    return this._embeddings.length >= this._cible;
  }

  /** Consigne à afficher pour la prochaine image. */
  consigne() {
    return POSES[indicePose(this._embeddings.length, this._cible / POSES.length)].consigne;
  }

  /** Ajoute l'embedding d'une image valide. Renvoie false si l'enrôlement est déjà complet. */
  ajouter(embedding) {
    if (this.termine) return false;
    this._embeddings.push(Float32Array.from(embedding));
    return true;
  }

  /** Gabarit final : moyenne normalisée des embeddings retenus. */
  gabarit() {
    if (!this.termine) throw new Error(`Enrôlement incomplet : ${this.nombre} images sur ${this._cible}`);
    return moyenneNormalisee(this._embeddings);
  }
}
