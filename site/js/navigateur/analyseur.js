// Détection et reconnaissance dans le navigateur, avec ONNX Runtime Web et les modèles buffalo_s.
// Les images restent sur l'appareil : aucune requête n'envoie de photo ailleurs.

import {
  CLE_MOTEUR,
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

const WASM = { nom: "wasm", detection: ["wasm"], reconnaissance: ["wasm"] };
const WEBGPU = { nom: "webgpu", detection: ["webgpu"], reconnaissance: ["webgpu"] };
const HYBRIDE = { nom: "hybride", detection: ["webgpu"], reconnaissance: ["wasm"] };

/**
 * Moteur demandé par ?moteur= dans l'adresse. Le choix est mémorisé sur l'appareil, pour que les liens entre
 * pages (sans paramètre) le gardent ; ?moteur=wasm l'oublie.
 */
function moteurDemande() {
  const parametre = new URLSearchParams(globalThis.location?.search ?? "").get("moteur");
  try {
    if (parametre === "webgpu" || parametre === "hybride") globalThis.localStorage.setItem(CLE_MOTEUR, parametre);
    else if (parametre === "wasm") globalThis.localStorage.removeItem(CLE_MOTEUR);
    return parametre ?? globalThis.localStorage.getItem(CLE_MOTEUR);
  } catch {
    return parametre; // stockage bloqué (navigation privée) : le paramètre ne vaut que pour la page
  }
}

/**
 * Plans de chargement à essayer dans l'ordre. Par défaut : WASM, le plus rapide et le plus régulier mesuré
 * sur le GPU que le navigateur choisit seul (docs/DECISIONS.md, D-037). ?moteur=webgpu ou ?moteur=hybride
 * sert aux machines dont le GPU dédié est activé pour le navigateur.
 */
function plansDeChargement() {
  const force = moteurDemande();
  if (force === "webgpu") return [WEBGPU, WASM];
  if (force === "hybride") return [HYBRIDE, WASM];
  return [WASM];
}

const maintenant = () => performance.now();

export class Analyseur {
  constructor(detection, reconnaissance, fournisseur, chargementMs) {
    this._detection = detection;
    this._reconnaissance = reconnaissance;
    this.fournisseur = fournisseur;
    this.chargementMs = chargementMs;
    this._canevas = document.createElement("canvas");
    this._ctx = this._canevas.getContext("2d", { willReadFrequently: true });
    /** Durées de la dernière analyse, en ms, pour les indicateurs. */
    this.dernieresDurees = { lectureMs: 0, pretraitementMs: 0, inferenceMs: 0, embeddingMs: 0 };
  }

  /**
   * Charge les deux modèles. Essaie WebGPU si disponible, puis CPU (WASM) en repli.
   * onProgression reçoit un texte court pour l'interface.
   */
  static async charger({ onProgression = () => {} } = {}) {
    const ort = globalThis.ort;
    if (!ort) {
      throw new Error("ONNX Runtime n'a pas pu être chargé. Vérifiez la connexion Internet et rechargez la page.");
    }
    ort.env.wasm.numThreads = 1; // pas d'isolation d'origine croisée sur GitHub Pages
    ort.env.logLevel = "error";

    const debut = maintenant();
    let dernierErreur = null;
    for (const plan of plansDeChargement()) {
      let detection = null;
      try {
        onProgression("Chargement du détecteur de visages");
        detection = await ort.InferenceSession.create(URL_MODELE_DETECTION, { executionProviders: plan.detection, graphOptimizationLevel: "all" });
        onProgression("Chargement du modèle de reconnaissance");
        const reconnaissance = await ort.InferenceSession.create(URL_MODELE_RECONNAISSANCE, { executionProviders: plan.reconnaissance, graphOptimizationLevel: "all" });
        return new Analyseur(detection, reconnaissance, plan.nom, maintenant() - debut);
      } catch (erreur) {
        dernierErreur = erreur;
        await detection?.release?.();
      }
    }
    throw new Error(`Modèles indisponibles : ${dernierErreur?.message ?? "erreur inconnue"}`);
  }

  /** Copie une source (vidéo, image, bitmap) dans le canevas réutilisé et renvoie ses pixels RGBA. */
  _lirePixels(source, largeur, hauteur) {
    if (this._canevas.width !== largeur || this._canevas.height !== hauteur) {
      this._canevas.width = largeur;
      this._canevas.height = hauteur;
    }
    this._ctx.drawImage(source, 0, 0, largeur, hauteur);
    const { data } = this._ctx.getImageData(0, 0, largeur, hauteur);
    this._ctx.clearRect(0, 0, largeur, hauteur); // aucune image ne reste dans le canevas (D-022)
    return { width: largeur, height: hauteur, data };
  }

  /**
   * Détecte les visages d'une source et calcule leur embedding.
   * Renvoie [{boite, score, kps, embedding}] en coordonnées de la source.
   */
  async analyser(source, largeur, hauteur, { embeddings = true } = {}) {
    const t0 = maintenant();
    const image = this._lirePixels(source, largeur, hauteur);
    const t1 = maintenant();
    const { entree, echelle } = entreeDetection(image, TAILLE_DETECTION);
    const t2 = maintenant();
    const visages = await this._detecter(entree, echelle);
    const t3 = maintenant();

    let resultat = visages;
    if (embeddings) {
      resultat = [];
      for (const visage of visages) {
        const alignement = alignerVisage(image, visage.kps, 112);
        resultat.push({ ...visage, embedding: await this._plonger(alignement) });
      }
    }
    const t4 = maintenant();
    this.dernieresDurees = { lectureMs: t1 - t0, pretraitementMs: t2 - t1, inferenceMs: t3 - t2, embeddingMs: t4 - t3 };
    return resultat;
  }

  async _detecter(entree, echelle) {
    const taille = TAILLE_DETECTION;
    const tenseur = new globalThis.ort.Tensor("float32", entree, [1, 3, taille, taille]);
    const sortie = await this._detection.run({ [this._detection.inputNames[0]]: tenseur });
    const sorties = this._detection.outputNames.map((nom) => sortie[nom].data);
    return decoderScrfd(sorties, { taille, echelle, seuil: SEUIL_DETECTION, seuilNms: SEUIL_NMS });
  }

  async _plonger(alignement112) {
    const tenseur = new globalThis.ort.Tensor("float32", entreeReconnaissance(alignement112), [1, 3, 112, 112]);
    const sortie = await this._reconnaissance.run({ [this._reconnaissance.inputNames[0]]: tenseur });
    return normaliser(sortie[this._reconnaissance.outputNames[0]].data);
  }
}
