// Page Reconnaissance : flux caméra, cadre sur chaque visage, fiche du client reconnu à droite.

import { CLE_BASE, K_DETECTION, NOM_BOUTIQUE, SEUIL } from "../config.js";
import { Base } from "../coeur/base.js";
import { Galerie } from "../coeur/gabarit.js";
import { Pipeline } from "../coeur/pipeline.js";
import { formaterRendezVous, formaterMontant, $, notifier } from "../navigateur/commun.js";
import { ouvrirCamera } from "../navigateur/camera.js";
import { Analyseur } from "../navigateur/analyseur.js";
import { choisirStockage } from "../navigateur/stockage.js";
import { suggerer, formaterDate, dateDepuisIso } from "../coeur/suggestion.js";

const COULEUR_CONNU = "#3f7a9a";
const COULEUR_INCONNU = "#8c8c8c";

const { stockage } = choisirStockage();
const base = new Base(stockage, CLE_BASE);

const video = $("#video");
const canevas = $("#superposition");
const ctx = canevas.getContext("2d");

const etat = {
  analyseur: null,
  arreterCamera: null,
  pipeline: null,
  active: false,
  masquee: false,
  dernierCle: null,
  affichages: [],
};

// ---------- base et galerie ----------

function chargerGalerie() {
  return new Galerie(base.entreesGalerie());
}

function rafraichirAccueil() {
  const nombre = base.identifiants().length;
  $("#sous-accueil").textContent =
    nombre === 0
      ? "Aucun client enregistré pour l'instant. Ajoutez-en depuis la page Clients."
      : "Un instant, nous préparons votre accueil.";
}

// Quand la page Clients modifie la base (autre onglet ou même site), on recharge la galerie.
window.addEventListener("storage", (evenement) => {
  if (evenement.key !== CLE_BASE) return;
  etat.pipeline?.changerGalerie(chargerGalerie());
  rafraichirAccueil();
  etat.dernierCle = null;
});

// ---------- affichage de la fiche ----------

function personnePrincipale(affichages) {
  const connus = affichages.filter((a) => a.identifiant !== null && base.obtenir(a.identifiant));
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
  const maintenant = new Date();
  let cle = "aucune";
  if (personne) {
    const fiche = base.obtenir(personne.identifiant).fiche;
    const suggestion = suggerer(fiche, maintenant);
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
    const connu = a.identifiant !== null && base.obtenir(a.identifiant);
    const couleur = connu ? COULEUR_CONNU : COULEUR_INCONNU;
    const libelle = connu ? `${connu.fiche.prenom} ${connu.fiche.nom}` : "Inconnu";
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

// ---------- boucle de reconnaissance ----------

// Fenêtre glissante des 30 dernières images, pour un fps stable.
let images = [];
function mesureFps(maintenant) {
  images.push(maintenant);
  if (images.length > 30) images.shift();
  if (images.length < 2) return 0;
  return (images.length - 1) / ((images[images.length - 1] - images[0]) / 1000);
}

function afficherStatistiques(affichages, fps) {
  const meilleure = affichages.reduce((m, a) => Math.max(m, a.score), -Infinity);
  $("#fps").textContent = `${fps.toFixed(1)} fps`;
  $("#similarite").textContent = Number.isFinite(meilleure) ? `Similarité : ${meilleure.toFixed(2).replace(".", ",")}` : "Similarité : -";
}

async function boucle() {
  if (!etat.active) return;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    try {
      const affichages = await etat.pipeline.traiterImage(() =>
        etat.analyseur.analyser(video, video.videoWidth, video.videoHeight, { embeddings: true }),
      );
      etat.affichages = affichages;
      dessinerSuperposition(affichages);
      mettreAJourFiche(affichages);
      afficherStatistiques(affichages, mesureFps(performance.now()));
    } catch (erreur) {
      notifier(`Analyse interrompue : ${erreur.message}`, "erreur");
      arreter();
      return;
    }
  }
  requestAnimationFrame(boucle);
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
    etat.arreterCamera = await ouvrirCamera(video);
    if (!etat.analyseur) {
      etat.analyseur = await Analyseur.charger({ onProgression: statut });
    }
    etat.pipeline = new Pipeline({
      galerie: chargerGalerie(),
      seuil: SEUIL,
      k: K_DETECTION,
    });
    $("#seuil").textContent = `Seuil : ${SEUIL.toFixed(2).replace(".", ",")}`;
    $("#vide-camera").hidden = true;
    $("#arreter").hidden = false;
    etat.active = true;
    images = [];
    requestAnimationFrame(boucle);
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
  etat.active = false;
  etat.arreterCamera?.();
  etat.arreterCamera = null;
  $("#arreter").hidden = true;
  $("#vide-camera").hidden = false;
  statut("Caméra arrêtée. Redémarrez-la pour reconnaître à nouveau.");
  ctx.clearRect(0, 0, canevas.width, canevas.height);
}

$("#demarrer").addEventListener("click", demarrer);
$("#arreter").addEventListener("click", arreter);

// Premier affichage : état de la base.
rafraichirAccueil();
if (!base.identifiants().length) statut("Aucun client enregistré : ajoutez-en depuis la page Clients.");
