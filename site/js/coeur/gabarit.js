// Gabarits d'embeddings et reconnaissance par similarité cosinus. Pur JavaScript, sans navigateur.

export const DIMENSION = 512;

/** Vecteur unitaire (norme 1). Lève une erreur pour un vecteur nul. */
export function normaliser(vecteur) {
  let somme = 0;
  for (const v of vecteur) somme += v * v;
  const norme = Math.sqrt(somme);
  if (norme === 0) throw new Error("Impossible de normaliser un vecteur nul");
  return Float32Array.from(vecteur, (v) => v / norme);
}

/** Moyenne des embeddings normalisés, puis renormalisée : le gabarit d'un client. */
export function moyenneNormalisee(vecteurs) {
  if (vecteurs.length === 0) throw new Error("Au moins un embedding est nécessaire");
  const dimension = vecteurs[0].length;
  const somme = new Float64Array(dimension);
  for (const vecteur of vecteurs) {
    const unitaire = normaliser(vecteur);
    for (let i = 0; i < dimension; i++) somme[i] += unitaire[i];
  }
  return normaliser(somme);
}

/** Similarité cosinus de deux vecteurs déjà normalisés (produit scalaire). */
export function similarite(a, b) {
  let produit = 0;
  for (let i = 0; i < a.length; i++) produit += a[i] * b[i];
  return produit;
}

/** Galerie des gabarits, indexés par identifiant client. */
export class Galerie {
  constructor(entrees = []) {
    this._gabarits = new Map();
    for (const { identifiant, gabarit } of entrees) this.enroler(identifiant, gabarit);
  }

  enroler(identifiant, gabarit) {
    this._gabarits.set(identifiant, normaliser(gabarit));
  }

  supprimer(identifiant) {
    return this._gabarits.delete(identifiant);
  }

  contient(identifiant) {
    return this._gabarits.has(identifiant);
  }

  identifiants() {
    return [...this._gabarits.keys()];
  }

  /**
   * Meilleure correspondance. L'identifiant vaut null si le meilleur score reste sous le seuil.
   * Le score est renvoyé dans tous les cas, pour le recalibrage.
   */
  reconnaitre(embedding, seuil) {
    if (this._gabarits.size === 0) return { identifiant: null, score: 0 };
    const requete = normaliser(embedding);
    let meilleurId = null;
    let meilleurScore = -Infinity;
    for (const [identifiant, gabarit] of this._gabarits) {
      const score = similarite(gabarit, requete);
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleurId = identifiant;
      }
    }
    return { identifiant: meilleurScore >= seuil ? meilleurId : null, score: meilleurScore };
  }
}
