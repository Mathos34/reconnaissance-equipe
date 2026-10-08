// Préparation des images pour les modèles : redimensionnement bilinéaire et tenseurs NCHW.
// Pur JavaScript, donc identique dans le navigateur et dans les tests Node.
// Les formules reprennent celles d'InsightFace (scrfd.py et arcface_onnx.py).

import { calculerLetterbox } from "./scrfd.js";

/** Redimensionnement bilinéaire d'une image RGBA (demi-pixel au centre, comme cv2.resize INTER_LINEAR). */
export function redimensionner(image, nouvelleLargeur, nouvelleHauteur) {
  const { width: W, height: H, data } = image;
  const sortie = new Uint8ClampedArray(nouvelleLargeur * nouvelleHauteur * 4);
  const echelleX = W / nouvelleLargeur;
  const echelleY = H / nouvelleHauteur;
  for (let y = 0; y < nouvelleHauteur; y++) {
    const sy = Math.max(0, (y + 0.5) * echelleY - 0.5);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, H - 1);
    const fy = sy - y0;
    for (let x = 0; x < nouvelleLargeur; x++) {
      const sx = Math.max(0, (x + 0.5) * echelleX - 0.5);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, W - 1);
      const fx = sx - x0;
      const destination = (y * nouvelleLargeur + x) * 4;
      for (let canal = 0; canal < 4; canal++) {
        const p00 = data[(y0 * W + x0) * 4 + canal];
        const p01 = data[(y0 * W + x1) * 4 + canal];
        const p10 = data[(y1 * W + x0) * 4 + canal];
        const p11 = data[(y1 * W + x1) * 4 + canal];
        const haut = p00 + (p01 - p00) * fx;
        const bas = p10 + (p11 - p10) * fx;
        sortie[destination + canal] = haut + (bas - haut) * fy;
      }
    }
  }
  return { width: nouvelleLargeur, height: nouvelleHauteur, data: sortie };
}

/**
 * Entrée du détecteur : l'image est réduite pour tenir dans un carré de `taille`, coin haut-gauche,
 * le reste du carré est noir. Normalisation (valeur - 127.5) / 128, canaux RGB, ordre NCHW.
 */
export function entreeDetection(image, taille) {
  const lettre = calculerLetterbox(image.width, image.height, taille);
  const reduite = redimensionner(image, lettre.largeur, lettre.hauteur);
  const surface = taille * taille;
  const valeurNoire = (0 - 127.5) / 128;
  const entree = new Float32Array(3 * surface).fill(valeurNoire);
  for (let y = 0; y < lettre.hauteur; y++) {
    for (let x = 0; x < lettre.largeur; x++) {
      const source = (y * lettre.largeur + x) * 4;
      const cible = y * taille + x;
      entree[cible] = (reduite.data[source] - 127.5) / 128;
      entree[surface + cible] = (reduite.data[source + 1] - 127.5) / 128;
      entree[2 * surface + cible] = (reduite.data[source + 2] - 127.5) / 128;
    }
  }
  return { entree, echelle: lettre.echelle };
}

/** Entrée de la reconnaissance : visage aligné 112 x 112 en RGB, normalisation (valeur - 127.5) / 127.5. */
export function entreeReconnaissance(alignement112) {
  const surface = 112 * 112;
  const entree = new Float32Array(3 * surface);
  for (let i = 0; i < surface; i++) {
    entree[i] = (alignement112[i * 3] - 127.5) / 127.5;
    entree[surface + i] = (alignement112[i * 3 + 1] - 127.5) / 127.5;
    entree[2 * surface + i] = (alignement112[i * 3 + 2] - 127.5) / 127.5;
  }
  return entree;
}
