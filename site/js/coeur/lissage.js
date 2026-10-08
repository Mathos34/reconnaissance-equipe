// Lissage des décisions par piste : un client s'affiche si VOTES_MIN décisions
// sur les FENETRE_DECISION dernières concordent. Les décisions null (inconnu) ne comptent pour personne.

import { FENETRE_DECISION, VOTES_MIN } from "../config.js";

export class Lisseur {
  constructor({ fenetre = FENETRE_DECISION, votesMin = VOTES_MIN } = {}) {
    if (votesMin > fenetre) throw new Error("votesMin ne peut pas dépasser la taille de la fenêtre");
    this._fenetre = fenetre;
    this._votesMin = votesMin;
    this._historiques = new Map();
  }

  /** Enregistre une décision pour une piste et renvoie l'identifiant à afficher (ou null). */
  ajouter(pisteId, identifiant) {
    if (!this._historiques.has(pisteId)) this._historiques.set(pisteId, []);
    const historique = this._historiques.get(pisteId);
    historique.push(identifiant);
    if (historique.length > this._fenetre) historique.shift();
    return this.affiche(pisteId);
  }

  affiche(pisteId) {
    const historique = this._historiques.get(pisteId);
    if (!historique || historique.length === 0) return null;
    const compte = new Map();
    for (const identifiant of historique) {
      if (identifiant === null) continue;
      compte.set(identifiant, (compte.get(identifiant) || 0) + 1);
    }
    let meilleur = null;
    let votes = 0;
    for (const [identifiant, n] of compte) {
      if (n > votes) {
        meilleur = identifiant;
        votes = n;
      }
    }
    return votes >= this._votesMin ? meilleur : null;
  }

  oublier(pisteId) {
    this._historiques.delete(pisteId);
  }

  pistesSuivies() {
    return [...this._historiques.keys()];
  }
}
