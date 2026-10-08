// Détection et reconnaissance dans le navigateur, avec ONNX Runtime Web et les modèles buffalo_s.
// Les images restent sur l'appareil : aucune requête n'envoie de photo ailleurs.

import {
  SEUIL_DETECTION,
  SEUIL_NMS,
  TAILLE_DETECTION,
  URL_MODELE_DETECTION,
  URL_MODELE_RECONNAISSANCE,
} from "../config.js";
import { normaliser } from "../coeur/gabarit.js";
import { alignerVisage } from "../coeur/geometrie.js";
import { entreeDetection, entreeReconnaissance } from "../coeur/image.js";
import { decoderScrfd } from "../coeur/scrfd.js";

async function choisirFournisseurs() {
  if (globalThis.navigator?.gpu) {
    try {
      const adaptateur = await navigator.gpu.requestAdapter();
      if (adaptateur) return ["webgpu", "wasm"];
    } catch {
      // Pas de WebGPU utilisable : on passe au CPU (WASM).
    }
  }
  return ["wasm"];
}

/** Copie une source (vidéo, image, bitmap) dans un canevas et renvoie ses pixels RGBA. */
function lirePixels(source, largeur, hauteur) {
  const canevas = document.createElement("canvas");
  canevas.width = largeur;
  canevas.height = hauteur;
  const ctx = canevas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, largeur, hauteur);
  const { data } = ctx.getImageData(0, 0, largeur, hauteur);
  return { width: largeur, height: hauteur, data, canevas };
}

export class Analyseur {
  constructor(detection, reconnaissance, fournisseur) {
    this._detection = detection;
    this._reconnaissance = reconnaissance;
    this.fournisseur = fournisseur;
  }

  /**
   * Charge les deux modèles. Essaie WebGPU si disponible, puis CPU (WASM) en repli.
   * onProgression reçoit un texte court pour l'interface.
   */
  static async charger({ onProgression = () => {} } = {}) {
    if (!globalThis.ort) {
      throw new Error("ONNX Runtime n'a pas pu être chargé. Vérifiez la connexion Internet et rechargez la page.");
    }
    globalThis.ort.env.wasm.numThreads = 1; // pas d'isolation d'origine croisée sur GitHub Pages
    globalThis.ort.env.logLevel = "error"; // avertissements de placement des nœuds : sans intérêt pour l'utilisateur
    const essais = [await choisirFournisseurs()];
    if (essais[0][0] !== "wasm") essais.push(["wasm"]);

    let dernierErreur = null;
    for (const fournisseurs of essais) {
      try {
        onProgression("Chargement du détecteur de visages");
        const detection = await globalThis.ort.InferenceSession.create(URL_MODELE_DETECTION, {
          executionProviders: fournisseurs,
          graphOptimizationLevel: "all",
        });
        onProgression("Chargement du modèle de reconnaissance");
        const reconnaissance = await globalThis.ort.InferenceSession.create(URL_MODELE_RECONNAISSANCE, {
          executionProviders: fournisseurs,
          graphOptimizationLevel: "all",
        });
        return new Analyseur(detection, reconnaissance, fournisseurs[0]);
      } catch (erreur) {
        dernierErreur = erreur;
      }
    }
    throw new Error(`Modèles indisponibles : ${dernierErreur?.message ?? "erreur inconnue"}`);
  }

  /**
   * Détecte les visages d'une source et calcule leur embedding.
   * Renvoie [{boite, score, kps, embedding}] en coordonnées de la source.
   */
  async analyser(source, largeur, hauteur, { embeddings = true } = {}) {
    const image = lirePixels(source, largeur, hauteur);
    const visages = await this._detecter(image);
    if (!embeddings) return visages.map(({ boite, score, kps }) => ({ boite, score, kps }));
    const resultat = [];
    for (const visage of visages) {
      const alignement = alignerVisage(image, visage.kps, 112);
      const embedding = await this._plonger(alignement);
      resultat.push({ ...visage, embedding });
    }
    return resultat;
  }

  async _detecter(image) {
    const taille = TAILLE_DETECTION;
    const { entree, echelle } = entreeDetection(image, taille);
    const tenseur = new globalThis.ort.Tensor("float32", entree, [1, 3, taille, taille]);
    const sortie = await this._detection.run({ [this._detection.inputNames[0]]: tenseur });
    const sorties = this._detection.outputNames.map((nom) => sortie[nom].data);
    return decoderScrfd(sorties, { taille, echelle, seuil: SEUIL_DETECTION, seuilNms: SEUIL_NMS });
  }

  async _plonger(alignement112) {
    const tenseur = new globalThis.ort.Tensor("float32", entreeReconnaissance(alignement112), [1, 3, 112, 112]);
    const sortie = await this._reconnaissance.run({ [this._reconnaissance.inputNames[0]]: tenseur });
    const brut = sortie[this._reconnaissance.outputNames[0]].data;
    return normaliser(brut);
  }
}
