// Base des clients : une seule clé de stockage contenant les fiches et les gabarits.
// Le stockage est injecté (localStorage dans le navigateur, un objet en mémoire dans les tests).
// Format de sauvegarde : JSON versionné, exporté et importé depuis la page Clients.

import { CLE_BASE } from "../config.js";
import { erreursFiche, validerFiche } from "./fiche.js";
import { normaliser } from "./gabarit.js";

export const FORMAT_SAUVEGARDE = "maison-test";
export const VERSION_BASE = 1;

/** Stockage en mémoire, avec la même interface que localStorage. */
export class StockageMemoire {
  constructor() {
    this._donnees = new Map();
  }
  getItem(cle) {
    return this._donnees.has(cle) ? this._donnees.get(cle) : null;
  }
  setItem(cle, valeur) {
    this._donnees.set(cle, String(valeur));
  }
  removeItem(cle) {
    this._donnees.delete(cle);
  }
}

function etatVide() {
  return { version: VERSION_BASE, clients: {} };
}

export class Base {
  constructor(stockage = new StockageMemoire(), cle = CLE_BASE) {
    this._stockage = stockage;
    this._cle = cle;
  }

  _charger() {
    const brut = this._stockage.getItem(this._cle);
    if (brut === null) return etatVide();
    const etat = JSON.parse(brut);
    if (etat.version !== VERSION_BASE) throw new Error(`Version de base inconnue : ${etat.version}`);
    return etat;
  }

  _sauver(etat) {
    this._stockage.setItem(this._cle, JSON.stringify(etat));
  }

  /** Liste des clients, triée par nom. Sans les gabarits, qui ne sortent pas de la base. */
  lister() {
    const etat = this._charger();
    return Object.values(etat.clients)
      .map((c) => ({
        identifiant: c.fiche.identifiant,
        fiche: structuredClone(c.fiche),
        aGabarit: c.gabarit !== null,
        consentement: c.consentement ? { ...c.consentement } : null,
      }))
      .sort((a, b) => `${a.fiche.nom} ${a.fiche.prenom}`.localeCompare(`${b.fiche.nom} ${b.fiche.prenom}`, "fr"));
  }

  obtenir(identifiant) {
    const c = this._charger().clients[identifiant];
    if (!c) return null;
    return { fiche: structuredClone(c.fiche), aGabarit: c.gabarit !== null, consentement: c.consentement };
  }

  identifiants() {
    return Object.keys(this._charger().clients);
  }

  /**
   * Crée ou met à jour une fiche. `gabarit` (Float32Array) et `consentement` ne sont écrits que s'ils sont fournis :
   * modifier une fiche sans recapturer le visage conserve le gabarit existant.
   */
  enregistrer(fiche, { gabarit = null, consentement = null, maintenant = new Date() } = {}) {
    validerFiche(fiche);
    const etat = this._charger();
    const existant = etat.clients[fiche.identifiant];
    etat.clients[fiche.identifiant] = {
      fiche: structuredClone(fiche),
      gabarit: gabarit !== null ? Array.from(normaliser(gabarit)) : existant ? existant.gabarit : null,
      consentement: consentement ?? (existant ? existant.consentement : null),
      creeLe: existant ? existant.creeLe : maintenant.toISOString(),
      modifieLe: maintenant.toISOString(),
    };
    this._sauver(etat);
  }

  /** Retire les données biométriques (le gabarit), la fiche reste. Équivalent de --delete. */
  retirerBiometrie(identifiant) {
    const etat = this._charger();
    const c = etat.clients[identifiant];
    if (!c || c.gabarit === null) return false;
    c.gabarit = null;
    this._sauver(etat);
    return true;
  }

  /** Supprime le client entier, fiche et gabarit. Équivalent de --purge. */
  supprimer(identifiant) {
    const etat = this._charger();
    if (!(identifiant in etat.clients)) return false;
    delete etat.clients[identifiant];
    this._sauver(etat);
    return true;
  }

  /** Entrées de la galerie : identifiant et gabarit, pour les clients qui en ont un. */
  entreesGalerie() {
    const etat = this._charger();
    return Object.entries(etat.clients)
      .filter(([, c]) => c.gabarit !== null)
      .map(([identifiant, c]) => ({ identifiant, gabarit: Float32Array.from(c.gabarit) }));
  }

  /** Sauvegarde complète au format JSON. Contient des gabarits biométriques : à garder précieusement. */
  exporter(maintenant = new Date()) {
    const etat = this._charger();
    return JSON.stringify(
      {
        format: FORMAT_SAUVEGARDE,
        version: VERSION_BASE,
        exporteLe: maintenant.toISOString(),
        clients: Object.values(etat.clients),
      },
      null,
      2,
    );
  }

  /**
   * Importe une sauvegarde. Toute la sauvegarde est vérifiée avant écriture : un fichier invalide
   * ne modifie rien. Mode "fusion" : les clients du fichier remplacent ceux de même identifiant.
   * Mode "remplacer" : la base est vidée avant l'import.
   */
  importer(texte, { mode = "fusion" } = {}) {
    let donnees;
    try {
      donnees = JSON.parse(texte);
    } catch {
      throw new Error("Le fichier n'est pas un JSON valide");
    }
    if (donnees.format !== FORMAT_SAUVEGARDE || donnees.version !== VERSION_BASE || !Array.isArray(donnees.clients)) {
      throw new Error("Ce fichier n'est pas une sauvegarde Maison Test reconnue");
    }
    const vus = new Set();
    for (const c of donnees.clients) {
      const erreurs = erreursFiche(c.fiche || {});
      if (erreurs.length > 0) throw new Error(`Client ${c.fiche?.identifiant ?? "?"} : ${erreurs[0].message}`);
      if (vus.has(c.fiche.identifiant)) throw new Error(`Identifiant en double : ${c.fiche.identifiant}`);
      vus.add(c.fiche.identifiant);
      if (c.gabarit !== null && (!Array.isArray(c.gabarit) || c.gabarit.length !== 512)) {
        throw new Error(`Client ${c.fiche.identifiant} : gabarit invalide`);
      }
    }

    const etat = mode === "remplacer" ? etatVide() : this._charger();
    let ajoutes = 0;
    let misAJour = 0;
    for (const c of donnees.clients) {
      const id = c.fiche.identifiant;
      if (id in etat.clients) misAJour += 1;
      else ajoutes += 1;
      etat.clients[id] = {
        fiche: structuredClone(c.fiche),
        gabarit: c.gabarit,
        consentement: c.consentement ?? null,
        creeLe: c.creeLe ?? new Date().toISOString(),
        modifieLe: c.modifieLe ?? new Date().toISOString(),
      };
    }
    this._sauver(etat);
    return { ajoutes, misAJour, total: donnees.clients.length };
  }
}
