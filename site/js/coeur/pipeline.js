// Pipeline de reconnaissance image par image : détection une image sur K, suivi, reconnaissance, lissage.
// La détection est fournie par l'appelant (navigateur) ; ce module ne fait que la logique.
// Rien n'est conservé : les embeddings des visages inconnus sont oubliés dès la fin de l'image.

import { K_DETECTION, SEUIL } from "../config.js";
import { Lisseur } from "./lissage.js";
import { Suiveur } from "./suivi.js";

export class Pipeline {
  constructor({ galerie, seuil = SEUIL, k = K_DETECTION, suiveur = new Suiveur(), lisseur = new Lisseur() }) {
    if (!Number.isInteger(k) || k < 1) throw new Error("k doit être un entier d'au moins 1");
    this._galerie = galerie;
    this._seuil = seuil;
    this._k = k;
    this._suiveur = suiveur;
    this._lisseur = lisseur;
    this._scores = new Map();
    this._compteur = 0;
  }

  changerGalerie(galerie) {
    this._galerie = galerie;
  }

  /** Vrai si cette image doit être analysée (détection et embedding). */
  doitDetecter() {
    return this._compteur % this._k === 0;
  }

  /**
   * Traite une image. `detecter` est appelée seulement quand la détection est due, et doit renvoyer
   * [{boite, score, embedding}]. Renvoie les visages à afficher : [{piste, boite, identifiant, score}].
   */
  async traiterImage(detecter) {
    if (this.doitDetecter()) {
      const visages = await detecter();
      this.appliquerDetection(visages);
    }
    this._compteur += 1;
    return this.affichages();
  }

  /** Met à jour le suivi, la reconnaissance et le lissage à partir d'une détection. */
  appliquerDetection(visages) {
    const avant = new Set(this._suiveur.pistes().map((p) => p.identifiant));
    const associations = this._suiveur.mettreAJour(visages.map((v) => v.boite));
    const apres = new Set(this._suiveur.pistes().map((p) => p.identifiant));
    for (const disparue of avant) {
      if (!apres.has(disparue)) {
        this._lisseur.oublier(disparue);
        this._scores.delete(disparue);
      }
    }
    for (const { piste, index } of associations) {
      const resultat = this._galerie.reconnaitre(visages[index].embedding, this._seuil);
      this._lisseur.ajouter(piste.identifiant, resultat.identifiant);
      this._scores.set(piste.identifiant, resultat.score);
    }
  }

  /** Visages actuellement suivis, avec leur identité lissée (null = inconnu). */
  affichages() {
    return this._suiveur.pistes().map((piste) => ({
      piste: piste.identifiant,
      boite: piste.boite,
      identifiant: this._lisseur.affiche(piste.identifiant),
      score: this._scores.get(piste.identifiant) ?? 0,
    }));
  }
}
