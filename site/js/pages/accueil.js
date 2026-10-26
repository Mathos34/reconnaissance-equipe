// Page Reconnaissance : flux caméra, cadre sur chaque visage, fiche du client reconnu,
// et indicateurs en direct (fps, latence, délai avant reconnaissance, similarité, moteur).

import { CLE_BASE, K_DETECTION, SEUIL } from "../config.js";
import { Base } from "../coeur/base.js";
import { Galerie } from "../coeur/gabarit.js";
import { JournalIndicateurs, MesuresReconnaissance } from "../coeur/indicateurs.js";
import { Pipeline } from "../coeur/pipeline.js";
import { suggerer, formaterDate, dateDepuisIso } from "../coeur/suggestion.js";
import { formaterRendezVous, formaterMontant, $, notifier } from "../navigateur/commun.js";
import { ouvrirCamera } from "../navigateur/camera.js";
import { Analyseur } from "../navigateur/analyseur.js";
import { choisirStockage } from "../navigateur/stockage.js";

const COULEUR_CONNU = "#3f7a9a";
const COULEUR_INCONNU = "#8c8c8c";
const RAFRAICHISSEMENT_INDICATEURS_MS = 250;

const { stockage } = choisirStockage();
const base = new Base(stockage, CLE_BASE);
const journal = new JournalIndicateurs(stockage);

const video = $("#video");
const canevas = $("#superposition");
const ctx = canevas.getContext("2d");

const etat = {
  analyseur: null,
  arreterCamera: null,
  pipeline: null,
  mesures: null,
  session: 0, // jeton : une seule boucle active à la fois, même après un arrêt suivi d'un redémarrage
  masquee: false,
  dernierCle: null,
  affichages: [],
  fiches: new Map(), // cache des fiches, pour ne pas relire localStorage à chaque image
  dernierRafraichissement: 0,
};

const virgule = (nombre, decimales) => nombre.toFixed(decimales).replace(".", ",");

// ---------- base, cache et galerie ----------

function rechargerFiches() {
  etat.fiches = new Map(base.lister().map((c) => [c.identifiant, c.fiche]));
}

function chargerGalerie() {
  return new Galerie(base.entreesGalerie());
}

function rafraichirAccueil() {
  $("#sous-accueil").textContent =
    etat.fiches.size === 0
      ? "Aucun client enregistré pour l'instant. Ajoutez-en depuis la page Clients."
      : "Un instant, nous préparons votre accueil.";
}

// Quand la page Clients modifie la base (autre onglet du même site), on recharge fiches et galerie.
window.addEventListener("storage", (evenement) => {
  if (evenement.key !== CLE_BASE) return;
  rechargerFiches();
  etat.pipeline?.changerGalerie(chargerGalerie());
  rafraichirAccueil();
  etat.dernierCle = null;
});

// ---------- affichage de la fiche ----------

function personnePrincipale(affichages) {
  const connus = affichages.filter((a) => a.identifiant !== null && etat.fiches.has(a.identifiant));
  if (connus.length === 0) return null;
  const aire = (a) => (a.boite[2] - a.boite[0]) * (a.boite[3] - a.boite[1]);
  return connus.reduce((meilleur, a) => (aire(a) > aire(meilleur) ? a : meilleur));
}

function rendreFiche(fiche, suggestion) {
  $("#conseiller").textContent = `Conseiller attitré : ${fiche.conseiller}`;
  $("#nom-complet").textContent = `${fiche.civilite} ${fiche.prenom} ${fiche.nom}`;
  const reperes = [];
  if (fiche.taille_vetement) reperes.push(`Taille ${fiche.taille_vetement}`);
  if (fiche.styles?.length) reperes.push(fiche.styles.join(", "));
  $("#repere").textContent = reperes.join(" · ");

  $("#boisson").textContent = suggestion.boisson;
  $("#temperature").textContent = suggestion.temperature;
  $("#sucre").textContent = suggestion.sucre;
  $("#lait").textContent = suggestion.lait;
  $("#accroche").textContent = suggestion.accroche;

  const achats = $("#achats");
  achats.replaceChildren();
  if (!fiche.derniers_achats?.length) {
    achats.append(Object.assign(document.createElement("li"), { textContent: "Aucun achat enregistré" }));
  }
  for (const achat of fiche.derniers_achats || []) {
    const ligne = document.createElement("li");
    ligne.textContent = `${formaterDate(dateDepuisIso(achat.date))} · ${achat.article} · ${formaterMontant(achat.montant)}`;
    achats.append(ligne);
  }
  $("#notes").textContent = fiche.notes || "Aucune note.";
  $("#rdv").textContent = formaterRendezVous(fiche.prochain_rendez_vous);
}

function mettreAJourFiche(affichages) {
  const personne = personnePrincipale(affichages);
  let cle = "aucune";
  if (personne) {
    const fiche = etat.fiches.get(personne.identifiant);
    const suggestion = suggerer(fiche, new Date());
    cle = `${personne.identifiant}|${suggestion.moment}|${suggestion.accroche}`;
    if (cle !== etat.dernierCle) rendreFiche(fiche, suggestion);
  }
  if (cle !== etat.dernierCle) {
    $("#fiche").hidden = !personne || etat.masquee;
    $("#accueil-fiche").hidden = Boolean(personne) || etat.masquee;
    $("#masquee").hidden = !etat.masquee;
    etat.dernierCle = cle;
  }
}

$("#bascule").addEventListener("click", () => {
  etat.masquee = !etat.masquee;
  $("#bascule").textContent = etat.masquee ? "Afficher la fiche" : "Masquer la fiche";
  $("#bascule").setAttribute("aria-pressed", String(etat.masquee));
  etat.dernierCle = null;
  mettreAJourFiche(etat.affichages);
});

// ---------- superposition vidéo ----------

function dessinerSuperposition(affichages) {
  const largeur = video.videoWidth;
  const hauteur = video.videoHeight;
  if (!largeur || !hauteur) return;
  if (canevas.width !== largeur || canevas.height !== hauteur) {
    canevas.width = largeur;
    canevas.height = hauteur;
  }
  ctx.clearRect(0, 0, largeur, hauteur);
  const epaisseur = Math.max(3, Math.round(largeur / 300));
  const taillePolice = Math.max(18, Math.round(largeur / 45));
  ctx.font = `600 ${taillePolice}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  for (const a of affichages) {
    const [x1, y1, x2, y2] = a.boite;
    const fiche = a.identifiant !== null ? etat.fiches.get(a.identifiant) : null;
    const couleur = fiche ? COULEUR_CONNU : COULEUR_INCONNU;
    const libelle = fiche ? `${fiche.prenom} ${fiche.nom}` : "Inconnu";
    ctx.strokeStyle = couleur;
    ctx.lineWidth = epaisseur;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const largeurTexte = ctx.measureText(libelle).width + 16;
    const y = Math.max(0, y1 - taillePolice - 10);
    ctx.fillStyle = couleur;
    ctx.fillRect(x1, y, largeurTexte, taillePolice + 8);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(libelle, x1 + 8, y + 4);
  }
}

// ---------- indicateurs en direct ----------

function afficherIndicateurs(affichages, instant) {
  if (!etat.mesures || instant - etat.dernierRafraichissement < RAFRAICHISSEMENT_INDICATEURS_MS) return;
  etat.dernierRafraichissement = instant;
  const m = etat.mesures;
  const latence = m.derniereLatence();
  const delai = m.dernierDelai();
  const meilleure = affichages.reduce((max, a) => Math.max(max, a.score), -Infinity);
  $("#kpi-fps").textContent = virgule(m.fpsRecent(), 1);
  $("#kpi-analyses").textContent = virgule(m.analysesRecentes(), 1);
  $("#kpi-latence").textContent = latence === null ? "-" : `${Math.round(latence)} ms`;
  $("#kpi-delai").textContent = delai === null ? "-" : `${virgule(delai / 1000, 2)} s`;
  $("#kpi-similarite").textContent = Number.isFinite(meilleure) ? virgule(meilleure, 2) : "-";
}

function enregistrerSession() {
  if (!etat.mesures) return;
  const resume = etat.mesures.resume(performance.now());
  if (resume.detections > 0) journal.ajouter(resume);
  etat.mesures = null;
}

// ---------- boucle de reconnaissance ----------

async function boucle(session) {
  if (session !== etat.session) return;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    try {
      let detectionFaite = false;
      const affichages = await etat.pipeline.traiterImage(async () => {
        const visages = await etat.analyseur.analyser(video, video.videoWidth, video.videoHeight, { embeddings: true });
        const d = etat.analyseur.dernieresDurees;
        etat.mesures?.detection({
          pretraitementMs: d.lectureMs + d.pretraitementMs,
          inferenceMs: d.inferenceMs,
          embeddingMs: d.embeddingMs,
          visages: visages.length,
          instant: performance.now(),
        });
        detectionFaite = true;
        return visages;
      });
      if (session !== etat.session) return; // arrêt pendant l'analyse : on ne dessine plus rien
      const instant = performance.now();
      if (detectionFaite) etat.mesures?.decisions(etat.pipeline.derniersResultats());
      etat.mesures?.image(instant);
      etat.mesures?.observer(affichages, instant);
      etat.affichages = affichages;
      dessinerSuperposition(affichages);
      mettreAJourFiche(affichages);
      afficherIndicateurs(affichages, instant);
    } catch (erreur) {
      notifier(`Analyse interrompue : ${erreur.message}`, "erreur");
      arreter();
      return;
    }
  }
  requestAnimationFrame(() => boucle(session));
}

// ---------- démarrage et arrêt ----------

function statut(texte) {
  $("#message-camera").textContent = texte;
}

async function demarrer() {
  const bouton = $("#demarrer");
  bouton.disabled = true;
  try {
    statut("Démarrage de la caméra...");
    etat.arreterCamera = await ouvrirCamera(video, {
      surFin: () => {
        if (!etat.arreterCamera) return;
        arreter();
        notifier("La caméra s'est arrêtée (débranchée ou utilisée ailleurs).", "erreur");
      },
    });
    if (!etat.analyseur) {
      etat.analyseur = await Analyseur.charger({ onProgression: statut });
    }
    rechargerFiches();
    etat.pipeline = new Pipeline({ galerie: chargerGalerie(), seuil: SEUIL, k: K_DETECTION });
    etat.mesures = new MesuresReconnaissance({
      fournisseur: etat.analyseur.fournisseur,
      chargementMs: etat.analyseur.chargementMs,
      debut: performance.now(),
      seuil: SEUIL,
    });
    etat.dernierCle = null;
    $("#kpi-moteur").textContent = { webgpu: "WebGPU", hybride: "WebGPU + WASM", wasm: "WASM" }[etat.analyseur.fournisseur] ?? etat.analyseur.fournisseur;
    $("#vide-camera").hidden = true;
    $("#arreter").hidden = false;
    $("#arreter").focus();
    const session = ++etat.session;
    requestAnimationFrame(() => boucle(session));
  } catch (erreur) {
    statut(erreur.message);
    notifier(erreur.message, "erreur");
    etat.arreterCamera?.();
    etat.arreterCamera = null;
  } finally {
    bouton.disabled = false;
  }
}

function arreter() {
  etat.session += 1; // invalide la boucle en cours
  enregistrerSession();
  etat.arreterCamera?.();
  etat.arreterCamera = null;
  etat.affichages = [];
  etat.dernierCle = null;
  mettreAJourFiche([]);
  $("#arreter").hidden = true;
  $("#vide-camera").hidden = false;
  statut("Caméra arrêtée. Les indicateurs de la session sont dans la page Indicateurs.");
  ctx.clearRect(0, 0, canevas.width, canevas.height);
  $("#demarrer").focus();
}

$("#demarrer").addEventListener("click", demarrer);
$("#arreter").addEventListener("click", arreter);
// Fermeture ou changement de page : la session en cours est enregistrée dans le journal.
window.addEventListener("pagehide", enregistrerSession);

// Premier affichage : état de la base.
rechargerFiches();
rafraichirAccueil();
$("#tuile-similarite").title = `Meilleure similarité des visages visibles (seuil de reconnaissance : ${virgule(SEUIL, 2)})`;
if (etat.fiches.size === 0) statut("Aucun client enregistré : ajoutez-en depuis la page Clients.");
