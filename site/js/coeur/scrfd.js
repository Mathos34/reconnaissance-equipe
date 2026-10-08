// Post-traitement du détecteur SCRFD (buffalo_s, det_500m.onnx), porté depuis insightface/model_zoo/scrfd.py.
// Pur JavaScript : les sorties du réseau arrivent sous forme de tableaux.

export const STRIDES = [8, 16, 32];
const ANCRES_PAR_CELLULE = 2;

/**
 * Calcul de la mise à l'échelle avant détection, comme _detect_candidates dans scrfd.py :
 * l'image est réduite pour tenir dans un carré de `taille`, en gardant ses proportions, coin haut-gauche.
 */
export function calculerLetterbox(largeur, hauteur, taille) {
  const ratioImage = hauteur / largeur;
  let nouvelleLargeur;
  let nouvelleHauteur;
  if (ratioImage > 1) {
    nouvelleHauteur = taille;
    nouvelleLargeur = Math.trunc(taille / ratioImage);
  } else {
    nouvelleLargeur = taille;
    nouvelleHauteur = Math.trunc(taille * ratioImage);
  }
  return { largeur: nouvelleLargeur, hauteur: nouvelleHauteur, echelle: nouvelleHauteur / hauteur };
}

/**
 * Décode les 9 sorties du réseau (scores x3, boîtes x3, points x3, par niveau de stride).
 * Renvoie [{boite, score, kps}] dans les coordonnées de l'image d'origine.
 */
export function decoderScrfd(sorties, { taille, echelle, seuil, seuilNms }) {
  if (sorties.length !== 9) throw new Error(`SCRFD : 9 sorties attendues, ${sorties.length} reçues`);
  const candidats = [];
  STRIDES.forEach((stride, niveau) => {
    const scores = sorties[niveau];
    const boites = sorties[niveau + 3];
    const points = sorties[niveau + 6];
    const cellules = Math.trunc(taille / stride);
    for (let loc = 0; loc < cellules * cellules; loc++) {
      const cx = (loc % cellules) * stride;
      const cy = Math.trunc(loc / cellules) * stride;
      for (let a = 0; a < ANCRES_PAR_CELLULE; a++) {
        const idx = loc * ANCRES_PAR_CELLULE + a;
        const score = scores[idx];
        if (score < seuil) continue;
        const d = [boites[idx * 4] * stride, boites[idx * 4 + 1] * stride, boites[idx * 4 + 2] * stride, boites[idx * 4 + 3] * stride];
        const kps = [];
        for (let j = 0; j < 5; j++) {
          kps.push([
            (cx + points[idx * 10 + j * 2] * stride) / echelle,
            (cy + points[idx * 10 + j * 2 + 1] * stride) / echelle,
          ]);
        }
        candidats.push({
          boite: [(cx - d[0]) / echelle, (cy - d[1]) / echelle, (cx + d[2]) / echelle, (cy + d[3]) / echelle],
          score,
          kps,
        });
      }
    }
  });
  candidats.sort((x, y) => y.score - x.score);
  return nms(candidats, seuilNms);
}

/** Suppression des doublons (NMS), même formule que scrfd.py (aires avec le +1). */
export function nms(candidats, seuil) {
  const garder = [];
  const restants = [...candidats];
  while (restants.length > 0) {
    const i = restants.shift();
    garder.push(i);
    const restantsValides = [];
    for (const j of restants) {
      const xx1 = Math.max(i.boite[0], j.boite[0]);
      const yy1 = Math.max(i.boite[1], j.boite[1]);
      const xx2 = Math.min(i.boite[2], j.boite[2]);
      const yy2 = Math.min(i.boite[3], j.boite[3]);
      const w = Math.max(0, xx2 - xx1 + 1);
      const h = Math.max(0, yy2 - yy1 + 1);
      const inter = w * h;
      const aireI = (i.boite[2] - i.boite[0] + 1) * (i.boite[3] - i.boite[1] + 1);
      const aireJ = (j.boite[2] - j.boite[0] + 1) * (j.boite[3] - j.boite[1] + 1);
      const recouvrement = inter / (aireI + aireJ - inter);
      if (recouvrement <= seuil) restantsValides.push(j);
    }
    restants.splice(0, restants.length, ...restantsValides);
  }
  return garder;
}
