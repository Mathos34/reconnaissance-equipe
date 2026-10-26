// Préparation des images pour les modèles : redimensionnement bilinéaire et tenseurs NCHW.
// Pur JavaScript, donc identique dans le navigateur et dans les tests Node.
// Les formules reprennent celles d'InsightFace (scrfd.py et arcface_onnx.py).
// Les tampons de taille constante sont réutilisés d'une détection à l'autre : moins d'allocations,
// moins de pauses du ramasse-miettes pendant la reconnaissance en direct.

import { calculerLetterbox } from "./scrfd.js";

const tampons = new Map();

/** Tampon réutilisable, identifié par un nom et une taille. */
function tampon(nom, Type, longueur) {
  const cle = `${nom}:${longueur}`;
  let t = tampons.get(cle);
  if (!t) {
    t = new Type(longueur);
    tampons.set(cle, t);
  }
  return t;
}

/**
 * Redimensionnement bilinéaire d'une image RGBA (demi-pixel au centre, comme cv2.resize INTER_LINEAR).
 * Seuls les trois canaux couleur sont calculés ; l'alpha vaut 255.
 * `sortie` permet de fournir un tampon réutilisé.
 */
export function redimensionner(image, nouvelleLargeur, nouvelleHauteur, sortie = new Uint8ClampedArray(nouvelleLargeur * nouvelleHauteur * 4)) {
  const { width: W, height: H, data } = image;
  const echelleX = W / nouvelleLargeur;
  const echelleY = H / nouvelleHauteur;
  for (let y = 0; y < nouvelleHauteur; y++) {
    const sy = Math.max(0, (y + 0.5) * echelleY - 0.5);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, H - 1);
    const fy = sy - y0;
    const ligne0 = y0 * W;
    const ligne1 = y1 * W;
    for (let x = 0; x < nouvelleLargeur; x++) {
      const sx = Math.max(0, (x + 0.5) * echelleX - 0.5);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, W - 1);
      const fx = sx - x0;
      const destination = (y * nouvelleLargeur + x) * 4;
      const i00 = (ligne0 + x0) * 4;
      const i01 = (ligne0 + x1) * 4;
      const i10 = (ligne1 + x0) * 4;
      const i11 = (ligne1 + x1) * 4;
      for (let canal = 0; canal < 3; canal++) {
        const haut = data[i00 + canal] + (data[i01 + canal] - data[i00 + canal]) * fx;
        const bas = data[i10 + canal] + (data[i11 + canal] - data[i10 + canal]) * fx;
        sortie[destination + canal] = haut + (bas - haut) * fy;
      }
      sortie[destination + 3] = 255;
    }
  }
  return { width: nouvelleLargeur, height: nouvelleHauteur, data: sortie };
}

/**
 * Entrée du détecteur : l'image est réduite pour tenir dans un carré de `taille`, coin haut-gauche,
 * le reste du carré est noir. Normalisation (valeur - 127.5) / 128, canaux RGB, ordre NCHW.
 * Le tenseur renvoyé est un tampon réutilisé : il doit être consommé avant l'appel suivant.
 */
export function entreeDetection(image, taille) {
  const lettre = calculerLetterbox(image.width, image.height, taille);
  const reduite = redimensionner(image, lettre.largeur, lettre.hauteur, tampon("reduite", Uint8ClampedArray, lettre.largeur * lettre.hauteur * 4));
  const surface = taille * taille;
  const entree = tampon("detection", Float32Array, 3 * surface);
  entree.fill((0 - 127.5) / 128);
  const r = reduite.data;
  for (let y = 0; y < lettre.hauteur; y++) {
    for (let x = 0; x < lettre.largeur; x++) {
      const source = (y * lettre.largeur + x) * 4;
      const cible = y * taille + x;
      entree[cible] = (r[source] - 127.5) / 128;
      entree[surface + cible] = (r[source + 1] - 127.5) / 128;
      entree[2 * surface + cible] = (r[source + 2] - 127.5) / 128;
    }
  }
  return { entree, echelle: lettre.echelle };
}

/** Entrée de la reconnaissance : visage aligné 112 x 112 en RGB, normalisation (valeur - 127.5) / 127.5. */
export function entreeReconnaissance(alignement112) {
  const surface = 112 * 112;
  const entree = tampon("reconnaissance", Float32Array, 3 * surface);
  for (let i = 0; i < surface; i++) {
    entree[i] = (alignement112[i * 3] - 127.5) / 127.5;
    entree[surface + i] = (alignement112[i * 3 + 1] - 127.5) / 127.5;
    entree[2 * surface + i] = (alignement112[i * 3 + 2] - 127.5) / 127.5;
  }
  return entree;
}
