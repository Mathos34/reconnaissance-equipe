// Suivi des visages entre deux détections, par recouvrement des boîtes (IoU).
// Même algorithme que src/boutique/tracker.py.

import { ABSENCE_MAX, SEUIL_IOU } from "../config.js";
import { iou } from "./geometrie.js";

export class Suiveur {
  constructor({ seuilIou = SEUIL_IOU, absenceMax = ABSENCE_MAX } = {}) {
    this._seuilIou = seuilIou;
    this._absenceMax = absenceMax;
    this._pistes = [];
    this._prochainIdentifiant = 1;
  }

  /** Copie des pistes actuelles : identifiant, dernière boîte connue, détections sans correspondance. */
  pistes() {
    return this._pistes.map((p) => ({ identifiant: p.identifiant, boite: [...p.boite], absente: p.absente }));
  }

  /**
   * Associe chaque boîte détectée à une piste. Renvoie [{piste, index}] pour chaque boîte.
   * Une boîte sans voisin ouvre une nouvelle piste. Une piste absente trop longtemps est supprimée.
   */
  mettreAJour(boites) {
    const candidats = [];
    this._pistes.forEach((piste, iPiste) => {
      boites.forEach((boite, iBoite) => {
        candidats.push({ score: iou(piste.boite, boite), iPiste, iBoite });
      });
    });
    candidats.sort((a, b) => b.score - a.score);

    const pisteParBoite = new Map();
    const pistesPrises = new Set();
    for (const { score, iPiste, iBoite } of candidats) {
      if (score < this._seuilIou) break;
      if (pistesPrises.has(iPiste) || pisteParBoite.has(iBoite)) continue;
      const piste = this._pistes[iPiste];
      piste.boite = [...boites[iBoite]];
      piste.absente = 0;
      pisteParBoite.set(iBoite, piste);
      pistesPrises.add(iPiste);
    }

    this._pistes.forEach((piste, iPiste) => {
      if (!pistesPrises.has(iPiste)) piste.absente += 1;
    });

    boites.forEach((boite, iBoite) => {
      if (pisteParBoite.has(iBoite)) return;
      const nouvelle = { identifiant: this._prochainIdentifiant, boite: [...boite], absente: 0 };
      this._prochainIdentifiant += 1;
      this._pistes.push(nouvelle);
      pisteParBoite.set(iBoite, nouvelle);
    });

    this._pistes = this._pistes.filter((p) => p.absente <= this._absenceMax);
    return boites.map((_, index) => ({ piste: pisteParBoite.get(index), index }));
  }
}
