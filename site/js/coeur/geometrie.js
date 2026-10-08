// Géométrie : recouvrement de boîtes, similitude 2D et alignement d'un visage.
// Aucune dépendance au navigateur : ce module est testé avec node --test.

// Gabarit ArcFace : position des 5 points (yeux, nez, coins de la bouche) sur un visage aligné de 112 px.
export const GABARIT_ARCFACE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

/** Intersection sur union de deux boîtes [x1, y1, x2, y2]. */
export function iou(a, b) {
  const largeur = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const hauteur = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (largeur <= 0 || hauteur <= 0) return 0;
  const intersection = largeur * hauteur;
  const aireA = (a[2] - a[0]) * (a[3] - a[1]);
  const aireB = (b[2] - b[0]) * (b[3] - b[1]);
  const union = aireA + aireB - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Similitude 2D (échelle, rotation, translation) qui envoie `source` sur `cible` au sens des moindres carrés.
 * Renvoie la matrice affine [[a, -b, tx], [b, a, ty]] : x' = a x - b y + tx, y' = b x + a y + ty.
 */
export function similitudeVers(source, cible) {
  if (source.length !== cible.length || source.length < 2) {
    throw new Error("Il faut au moins deux paires de points de même longueur");
  }
  // Système normal 4 x 4 : inconnues (a, b, tx, ty).
  const ata = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const atb = [0, 0, 0, 0];
  for (let i = 0; i < source.length; i++) {
    const [x, y] = source[i];
    const [X, Y] = cible[i];
    const lignes = [
      { ligne: [x, -y, 1, 0], valeur: X },
      { ligne: [y, x, 0, 1], valeur: Y },
    ];
    for (const { ligne, valeur } of lignes) {
      for (let r = 0; r < 4; r++) {
        atb[r] += ligne[r] * valeur;
        for (let c = 0; c < 4; c++) ata[r][c] += ligne[r] * ligne[c];
      }
    }
  }
  const [a, b, tx, ty] = resoudre(ata, atb);
  return [
    [a, -b, tx],
    [b, a, ty],
  ];
}

/** Résolution d'un système linéaire par élimination de Gauss avec pivot partiel. */
function resoudre(matrice, second) {
  const n = second.length;
  const m = matrice.map((ligne, i) => [...ligne, second[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("Points d'alignement dégénérés");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const facteur = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= facteur * m[col][c];
    }
  }
  return m.map((ligne, i) => ligne[n] / ligne[i]);
}

/** Inverse d'une matrice affine 2 x 3. */
export function inverseAffine(m) {
  const [[a, b, tx], [c, d, ty]] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error("Transformation non inversible");
  return [
    [d / det, -b / det, (b * ty - d * tx) / det],
    [-c / det, a / det, (c * tx - a * ty) / det],
  ];
}

/**
 * Déformation affine d'une image RGBA (format ImageData) vers une image RGB de largeur x hauteur.
 * Interpolation bilinéaire ; les pixels hors de l'image valent 0, comme cv2.warpAffine(borderValue=0).
 */
export function deformerRgb(image, matrice, largeur, hauteur) {
  const inv = inverseAffine(matrice);
  const sortie = new Uint8Array(largeur * hauteur * 3);
  const { width: W, height: H, data } = image;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const sx = inv[0][0] * x + inv[0][1] * y + inv[0][2];
      const sy = inv[1][0] * x + inv[1][1] * y + inv[1][2];
      const destination = (y * largeur + x) * 3;
      if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, H - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let canal = 0; canal < 3; canal++) {
        const p00 = data[(y0 * W + x0) * 4 + canal];
        const p01 = data[(y0 * W + x1) * 4 + canal];
        const p10 = data[(y1 * W + x0) * 4 + canal];
        const p11 = data[(y1 * W + x1) * 4 + canal];
        const haut = p00 + (p01 - p00) * fx;
        const bas = p10 + (p11 - p10) * fx;
        sortie[destination + canal] = Math.round(haut + (bas - haut) * fy);
      }
    }
  }
  return sortie;
}

/** Visage aligné 112 x 112 (RGB) à partir des 5 points détectés. */
export function alignerVisage(image, pointsDetectes, taille = 112) {
  if (pointsDetectes.length !== 5) throw new Error("Cinq points sont nécessaires pour l'alignement");
  const ratio = taille / 112;
  const cible = GABARIT_ARCFACE.map(([x, y]) => [x * ratio, y * ratio]);
  const matrice = similitudeVers(pointsDetectes, cible);
  return deformerRgb(image, matrice, taille, taille);
}
