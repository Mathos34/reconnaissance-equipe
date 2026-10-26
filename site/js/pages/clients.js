// Page Clients : consentement, photo (capture guidée ou import), fiche, enregistrement dans la base du navigateur.
// Le consentement « J'ACCEPTE » est demandé avant toute capture : aucun visage n'est analysé sans lui.

import { CLE_BASE, IMAGES_ENROLEMENT } from "../config.js";
import { Base } from "../coeur/base.js";
import { Enrolement, evaluerImage, indicePose, POSES } from "../coeur/enrolement.js";
import { BOISSONS_SUGGEREES, LAITS, erreursFiche, identifiantSuivant, initiales } from "../coeur/fiche.js";
import { JournalIndicateurs, MesuresEnrolement, RAISON_ESPACEE } from "../coeur/indicateurs.js";
import { formaterDate } from "../coeur/suggestion.js";
import { $, $$, creer, notifier, telechargerTexte } from "../navigateur/commun.js";
import { ouvrirCamera } from "../navigateur/camera.js";
import { Analyseur } from "../navigateur/analyseur.js";
import { choisirStockage } from "../navigateur/stockage.js";

const MENTION = "J'ACCEPTE";
const MOT_SUPPRESSION = "SUPPRIMER";
const INTERVALLE_CAPTURE_MS = 180;
const INTERVALLE_MIN_RETENUE_MS = 450; // une image retenue au plus toutes les 450 ms, pour varier les poses

const { stockage } = choisirStockage();
const base = new Base(stockage, CLE_BASE);
const journal = new JournalIndicateurs(stockage);

const video = $("#video");
const canevas = $("#superposition");
const ctx = canevas.getContext("2d");
const dialogue = $("#dialogue-suppression");

const etat = {
  etape: 1,
  idEdition: null,
  enrolement: new Enrolement(),
  mesuresEnrolement: null,
  gabaritExistant: false,
  consentement: null, // { date, mention } donné pour la capture en cours
  analyseur: null,
  chargement: null, // promesse de chargement partagée : les modèles ne sont chargés qu'une fois
  arreterCamera: null,
  timer: null,
  enPause: false,
  occupe: false,
  importEnCours: false,
  dernierAjout: 0,
  jetonCamera: 0, // change à chaque arrêt de caméra
  jetonClient: 0, // change à chaque changement de client ou remise à zéro
  erreursVisibles: false,
  dernieresErreurs: "",
};

// ---------- utilitaires ----------

const consentementValide = (texte) => texte.trim().replace(/’/g, "'").toUpperCase() === MENTION;
const dateHeure = (iso) => {
  const d = new Date(iso);
  return `${formaterDate(d)} à ${String(d.getHours()).padStart(2, "0")} h ${String(d.getMinutes()).padStart(2, "0")}`;
};

function retour(message, niveau = "info") {
  const el = $("#retour");
  if (el.textContent === message && el.dataset.niveau === niveau) return; // évite de relire le même message
  el.textContent = message;
  el.dataset.niveau = niveau;
}

function listeDepuisTexte(texte) {
  return texte
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function chargerAnalyseur() {
  if (etat.analyseur) return etat.analyseur;
  etat.chargement ??= Analyseur.charger({ onProgression: (t) => retour(t) }).catch((erreur) => {
    etat.chargement = null;
    throw erreur;
  });
  etat.analyseur = await etat.chargement;
  return etat.analyseur;
}

// ---------- liste des clients ----------

function rafraichirListe() {
  const filtre = $("#recherche").value.trim().toLowerCase();
  const clients = base
    .lister()
    .filter((c) => !filtre || `${c.fiche.prenom} ${c.fiche.nom} ${c.identifiant}`.toLowerCase().includes(filtre));
  $("#liste").replaceChildren(
    ...clients.map((c) =>
      creer(
        "li",
        {
          class: `ligne-client${c.identifiant === etat.idEdition ? " selection" : ""}`,
          tabindex: 0,
          role: "button",
          "aria-current": c.identifiant === etat.idEdition ? "true" : null,
          onclick: () => chargerClient(c.identifiant),
          onkeydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              chargerClient(c.identifiant);
            }
          },
        },
        [
          creer("span", { class: "avatar" }, initiales(c.fiche)),
          creer("span", { class: "texte-ligne" }, [
            creer("span", { class: "nom" }, `${c.fiche.prenom} ${c.fiche.nom}`),
            creer("span", { class: "meta" }, `${c.identifiant} · ${c.fiche.preferences.boisson}`),
          ]),
          creer("span", { class: `badge ${c.aGabarit ? "ok" : "attente"}` }, c.aGabarit ? "Visage enregistré" : "Visage à enregistrer"),
        ],
      ),
    ),
  );
  $("#liste-vide").hidden = clients.length > 0;
}

// ---------- formulaire ----------

function ajouterLigneAchat(achat = {}) {
  const ligne = creer("div", { class: "achat" }, [
    creer("input", { type: "date", name: "achat-date", "aria-label": "Date de l'achat", value: achat.date ?? "" }),
    creer("input", { name: "achat-article", placeholder: "Article", "aria-label": "Article", value: achat.article ?? "" }),
    creer("input", { type: "number", min: "0", step: "1", name: "achat-montant", placeholder: "€", "aria-label": "Montant en euros", value: achat.montant ?? "" }),
    creer("button", { type: "button", class: "bouton discret petit retirer", "aria-label": "Retirer cet achat", onclick: () => { ligne.remove(); actualiserFormulaire(); } }, "×"),
  ]);
  $("#achats").append(ligne);
}

function lireAchats() {
  return $$("#achats .achat")
    .map((ligne) => {
      const montant = ligne.querySelector('[name="achat-montant"]').value;
      return {
        date: ligne.querySelector('[name="achat-date"]').value,
        article: ligne.querySelector('[name="achat-article"]').value.trim(),
        montant: montant === "" ? undefined : Number(montant),
      };
    })
    .filter((a) => a.date || a.article || a.montant !== undefined);
}

function lireFormulaire() {
  const formulaire = $("#formulaire");
  const valeur = (nom) => (formulaire.elements[nom]?.value ?? "").toString().trim();
  const sucreBrut = valeur("sucre");
  return {
    identifiant: valeur("identifiant"),
    civilite: valeur("civilite"),
    prenom: valeur("prenom"),
    nom: valeur("nom"),
    conseiller: valeur("conseiller"),
    preferences: {
      boisson: valeur("boisson"),
      temperature: formulaire.querySelector('[name="temperature"]:checked')?.value ?? "",
      sucre: sucreBrut === "" ? undefined : sucreBrut === "non" ? "non" : Number(sucreBrut),
      lait: valeur("lait"),
    },
    taille_vetement: valeur("taille_vetement"),
    styles: listeDepuisTexte(valeur("styles")),
    cadeaux_notes: listeDepuisTexte(valeur("cadeaux_notes")),
    derniers_achats: lireAchats(),
    notes: valeur("notes"),
    prochain_rendez_vous: valeur("prochain_rendez_vous") || null,
  };
}

/** Ajoute une option à une liste si la valeur importée n'y figure pas, pour ne jamais perdre une donnée. */
function assurerOption(select, valeur, libelle) {
  if (![...select.options].some((o) => o.value === valeur)) select.append(creer("option", { value: valeur }, libelle));
  select.value = valeur;
}

function remplirFormulaire(fiche) {
  const formulaire = $("#formulaire");
  formulaire.reset();
  formulaire.elements.identifiant.value = fiche.identifiant ?? "";
  formulaire.elements.civilite.value = fiche.civilite ?? "Madame";
  formulaire.elements.prenom.value = fiche.prenom ?? "";
  formulaire.elements.nom.value = fiche.nom ?? "";
  formulaire.elements.conseiller.value = fiche.conseiller ?? "";
  formulaire.elements.boisson.value = fiche.preferences?.boisson ?? "";
  const temperature = formulaire.querySelector(`[name="temperature"][value="${fiche.preferences?.temperature ?? ""}"]`);
  if (temperature) temperature.checked = true;
  const sucre = fiche.preferences?.sucre;
  if (sucre === undefined || sucre === "non" || sucre === 0) formulaire.elements.sucre.value = "non";
  else assurerOption(formulaire.elements.sucre, String(sucre), `${sucre} morceaux`);
  assurerOption(formulaire.elements.lait, fiche.preferences?.lait ?? "aucun", fiche.preferences?.lait ?? "aucun");
  formulaire.elements.taille_vetement.value = fiche.taille_vetement ?? "";
  formulaire.elements.styles.value = (fiche.styles ?? []).join(", ");
  formulaire.elements.cadeaux_notes.value = (fiche.cadeaux_notes ?? []).join(", ");
  formulaire.elements.notes.value = fiche.notes ?? "";
  formulaire.elements.prochain_rendez_vous.value = fiche.prochain_rendez_vous ? fiche.prochain_rendez_vous.slice(0, 16) : "";
  $("#achats").replaceChildren();
  for (const achat of fiche.derniers_achats ?? []) ajouterLigneAchat(achat);
}

function erreursComplete() {
  const fiche = lireFormulaire();
  const erreurs = erreursFiche(fiche);
  if (!etat.idEdition && fiche.identifiant && base.identifiants().includes(fiche.identifiant)) {
    erreurs.unshift({ champ: "identifiant", message: `L'identifiant ${fiche.identifiant} existe déjà` });
  }
  return { fiche, erreurs };
}

/** Met à jour la zone d'erreurs et aria-invalid, seulement après une première tentative et si la liste a changé. */
function afficherErreurs() {
  const { erreurs } = erreursComplete();
  const formulaire = $("#formulaire");
  const champsEnErreur = new Set(etat.erreursVisibles ? erreurs.map((e) => e.champ) : []);
  for (const champ of formulaire.querySelectorAll("[name], [data-champ]")) {
    const nom = champ.dataset.champ ?? champ.name;
    if (champsEnErreur.has(nom)) champ.setAttribute("aria-invalid", "true");
    else champ.removeAttribute("aria-invalid");
  }
  const texte = etat.erreursVisibles ? erreurs.map((e) => e.message).join("|") : "";
  if (texte !== etat.dernieresErreurs) {
    const zone = $("#erreurs-formulaire");
    zone.replaceChildren(...(etat.erreursVisibles ? erreurs : []).map((e) => creer("p", {}, e.message)));
    zone.hidden = texte === "";
    etat.dernieresErreurs = texte;
  }
  return erreurs;
}

function actualiserFormulaire() {
  afficherErreurs();
  rafraichirRecapitulatif();
}

// ---------- étapes ----------

function allerEtape(numero, { focus = true } = {}) {
  if (etat.etape === 1 && numero !== 1) arreterCamera();
  etat.etape = numero;
  for (const n of [1, 2, 3]) $(`#etape-${n}`).hidden = n !== numero;
  $$("#etapes li").forEach((li) => {
    const n = Number(li.dataset.etape);
    li.classList.toggle("active", n === numero);
    li.classList.toggle("fait", n < numero);
    const bouton = li.querySelector("button");
    if (n === numero) bouton.setAttribute("aria-current", "step");
    else bouton.removeAttribute("aria-current");
  });
  $("#precedent").hidden = numero === 1;
  $("#suivant").hidden = numero === 3;
  if (numero === 2) afficherErreurs();
  if (numero === 3) rafraichirRecapitulatif();
  if (focus) $(`#etape-${numero} .titre-etape`).focus();
}

// ---------- consentement ----------

function majConsentement() {
  const champ = $("#consentement");
  const aide = $("#consentement-aide");
  if (!etat.consentement && consentementValide(champ.value)) {
    etat.consentement = { date: new Date().toISOString(), mention: MENTION };
  }
  champ.readOnly = etat.consentement !== null;
  $("#bloc-consentement").classList.toggle("ok", etat.consentement !== null);
  if (etat.consentement) aide.textContent = `Consentement confirmé le ${dateHeure(etat.consentement.date)}.`;
  else if (champ.value.trim()) aide.textContent = `Tapez ${MENTION} pour confirmer.`;
  else aide.textContent = "";
  majControlesCapture();
}

// ---------- capture du visage ----------

function majControlesCapture() {
  const consenti = etat.consentement !== null;
  const termine = etat.enrolement.termine;
  const bouton = $("#activer");
  bouton.disabled = !consenti || termine;
  bouton.textContent = termine ? "Capture terminée" : etat.enrolement.nombre > 0 ? "Reprendre la capture" : "Activer la caméra";
  $("#aide-voile").textContent = !consenti
    ? "Confirmez d'abord le consentement."
    : termine
      ? `Les ${etat.enrolement.cible} images sont réunies.`
      : "Une seule personne, face à la caméra, avec une bonne lumière.";
  const importPossible = consenti && !termine && !etat.importEnCours;
  $("#fichiers").disabled = !importPossible;
  $("#zone-depot").setAttribute("aria-disabled", String(!importPossible));
}

function majProgression() {
  const { nombre: n, cible, termine } = etat.enrolement;
  $("#compte").textContent = String(n);
  $("#cible").textContent = String(cible);
  $("#barre").style.width = `${(n / cible) * 100}%`;
  $("#consigne").textContent = termine
    ? "Capture terminée. Passez à la fiche."
    : etat.consentement
      ? etat.enrolement.consigne()
      : "Confirmez le consentement, puis activez la caméra.";
  const parPose = cible / POSES.length;
  const posesFaites = Math.floor(n / parPose);
  $$("#poses li").forEach((li) => {
    const i = Number(li.dataset.pose);
    li.classList.toggle("fait", i < posesFaites);
    li.classList.toggle("courante", !termine && i === indicePose(n, parPose));
  });
  majControlesCapture();
  rafraichirRecapitulatif();
}

function dessinerCadre(visages, valide) {
  const largeur = video.videoWidth;
  const hauteur = video.videoHeight;
  if (!largeur) return;
  if (canevas.width !== largeur || canevas.height !== hauteur) {
    canevas.width = largeur;
    canevas.height = hauteur;
  }
  ctx.clearRect(0, 0, largeur, hauteur);
  ctx.strokeStyle = valide ? "#3f8a5a" : "#c98a2b";
  ctx.lineWidth = Math.max(3, Math.round(largeur / 300));
  for (const v of visages) {
    const [x1, y1, x2, y2] = v.boite;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
}

/** Mesure de l'enrôlement en cours. Une capture qui mélange caméra et photos est notée « mixte ». */
function mesureEnrolement(source) {
  if (!etat.mesuresEnrolement) {
    etat.mesuresEnrolement = new MesuresEnrolement({ source, debut: performance.now() });
  } else if (etat.mesuresEnrolement.source !== source) {
    etat.mesuresEnrolement.source = "mixte";
  }
  return etat.mesuresEnrolement;
}

function terminerMesureEnrolement() {
  const mesure = etat.mesuresEnrolement;
  if (!mesure) return;
  mesure.terminer(performance.now());
  journal.ajouter(mesure.resume());
  etat.mesuresEnrolement = null;
}

function enrolementTermine() {
  terminerMesureEnrolement();
  arreterCamera();
  retour(`Capture terminée : ${etat.enrolement.cible} images valides.`, "ok");
  notifier("Visage enregistré. Passez à la fiche.", "succes");
  $("#suivant").focus();
}

async function capturerUneImage() {
  if (etat.occupe || etat.enPause || etat.enrolement.termine || !etat.arreterCamera || !etat.analyseur || video.readyState < 2) return;
  etat.occupe = true;
  const jetonCamera = etat.jetonCamera;
  const jetonClient = etat.jetonClient;
  const enrolement = etat.enrolement;
  try {
    // L'embedding n'est calculé que si une image peut être retenue maintenant.
    const retenuePossible = Date.now() - etat.dernierAjout >= INTERVALLE_MIN_RETENUE_MS;
    const visages = await etat.analyseur.analyser(video, video.videoWidth, video.videoHeight, { embeddings: retenuePossible });
    if (jetonCamera !== etat.jetonCamera || jetonClient !== etat.jetonClient) return; // capture arrêtée pendant l'analyse
    const { visage, raison } = evaluerImage(visages);
    dessinerCadre(visages, Boolean(visage));
    const mesure = mesureEnrolement("camera");
    if (!visage) {
      mesure.analyse(raison);
      retour(raison, "attention");
      return;
    }
    if (!retenuePossible) {
      mesure.analyse(RAISON_ESPACEE);
      return;
    }
    mesure.analyse(null);
    enrolement.ajouter(visage.embedding);
    etat.dernierAjout = Date.now();
    majProgression();
    if (enrolement.termine) enrolementTermine();
    else retour(`Image retenue (${enrolement.nombre} sur ${enrolement.cible}).`, "ok");
  } catch (erreur) {
    notifier(`Capture interrompue : ${erreur.message}`, "erreur");
    arreterCamera();
  } finally {
    etat.occupe = false;
  }
}

function arreterBoucleCapture() {
  if (etat.timer) clearInterval(etat.timer);
  etat.timer = null;
}

function arreterCamera() {
  arreterBoucleCapture();
  etat.jetonCamera += 1;
  etat.arreterCamera?.();
  etat.arreterCamera = null;
  ctx.clearRect(0, 0, canevas.width, canevas.height);
  $("#voile-capture").hidden = false;
  $("#pause").hidden = true;
  $("#arreter-camera").hidden = true;
  majControlesCapture();
}

async function activerCamera() {
  if (!etat.consentement || etat.enrolement.termine) return;
  const jetonCamera = etat.jetonCamera;
  const jetonClient = etat.jetonClient;
  const bouton = $("#activer");
  bouton.disabled = true;
  try {
    if (!etat.analyseur) retour("Chargement des modèles (la première fois seulement)...");
    await chargerAnalyseur();
    if (jetonCamera !== etat.jetonCamera || jetonClient !== etat.jetonClient || etat.etape !== 1) return;
    const arreter = await ouvrirCamera(video, {
      surFin: () => {
        if (etat.arreterCamera !== arreter) return;
        arreterCamera();
        retour("La caméra s'est arrêtée (débranchée ou utilisée ailleurs).", "erreur");
      },
    });
    // Changement d'étape ou de client pendant l'ouverture : on referme aussitôt.
    if (jetonCamera !== etat.jetonCamera || jetonClient !== etat.jetonClient || etat.etape !== 1) {
      arreter();
      return;
    }
    etat.arreterCamera = arreter;
    etat.enPause = false;
    $("#voile-capture").hidden = true;
    $("#pause").hidden = false;
    $("#pause").textContent = "Pause";
    $("#arreter-camera").hidden = false;
    etat.timer = setInterval(capturerUneImage, INTERVALLE_CAPTURE_MS);
    mesureEnrolement("camera");
    retour("Regardez la caméra.");
    $("#arreter-camera").focus();
  } catch (erreur) {
    retour(erreur.message, "erreur");
    notifier(erreur.message, "erreur");
  } finally {
    majControlesCapture();
  }
}

function recommencerCapture() {
  arreterCamera();
  etat.jetonClient += 1;
  etat.enrolement = new Enrolement();
  etat.mesuresEnrolement = null;
  etat.dernierAjout = 0;
  $("#resultats-import").replaceChildren();
  majProgression();
  retour("Capture remise à zéro.");
}

async function importerPhotos(fichiers) {
  if (!etat.consentement) return notifier("Confirmez d'abord le consentement.", "erreur");
  if (etat.arreterCamera) return notifier("Arrêtez la caméra avant d'importer des photos.", "info");
  if (etat.importEnCours) return notifier("Un import est déjà en cours.", "info");
  etat.importEnCours = true;
  majControlesCapture();
  const jetonClient = etat.jetonClient;
  const enrolement = etat.enrolement;
  const resultats = $("#resultats-import");
  try {
    if (!etat.analyseur) retour("Chargement des modèles (la première fois seulement)...");
    await chargerAnalyseur();
    for (const fichier of fichiers) {
      if (jetonClient !== etat.jetonClient) break; // client changé pendant l'import
      if (enrolement.termine) {
        notifier(`Les ${enrolement.cible} images sont déjà réunies. Recommencez pour importer d'autres photos.`, "info");
        break;
      }
      const mesure = mesureEnrolement("photos");
      const ligne = creer("li", {}, `${fichier.name} : analyse...`);
      resultats.append(ligne);
      try {
        const bitmap = await createImageBitmap(fichier);
        const visages = await etat.analyseur.analyser(bitmap, bitmap.width, bitmap.height, { embeddings: true });
        bitmap.close?.();
        if (jetonClient !== etat.jetonClient) break;
        const { visage, raison } = evaluerImage(visages);
        mesure.analyse(visage ? null : raison);
        if (visage) enrolement.ajouter(visage.embedding);
        ligne.textContent = visage ? `${fichier.name} : retenue` : `${fichier.name} : refusée. ${raison}`;
        ligne.className = visage ? "ok" : "attention";
      } catch {
        mesure.analyse("Fichier illisible");
        ligne.textContent = `${fichier.name} : fichier illisible`;
        ligne.className = "attention";
      }
      majProgression();
      if (enrolement.termine) {
        terminerMesureEnrolement();
        retour(`Import terminé : ${enrolement.cible} images valides.`, "ok");
      }
    }
  } catch (erreur) {
    retour(erreur.message, "erreur");
    notifier(erreur.message, "erreur");
  } finally {
    etat.importEnCours = false;
    majControlesCapture();
  }
}

// ---------- enregistrement ----------

function pretPourEnregistrer() {
  const { fiche, erreurs } = erreursComplete();
  const nouveauVisage = etat.enrolement.termine;
  const visageOk = nouveauVisage || etat.gabaritExistant;
  const consentOk = !nouveauVisage || etat.consentement !== null;
  return { fiche, erreurs, nouveauVisage, visageOk, consentOk, ok: erreurs.length === 0 && visageOk && consentOk };
}

function pastille(id, ok, texte) {
  $(`#ok-${id}`).classList.toggle("ok", ok);
  $(`#texte-${id}`).textContent = texte;
}

function rafraichirRecapitulatif() {
  const statut = pretPourEnregistrer();
  const consentementEnregistre = etat.idEdition ? base.obtenir(etat.idEdition)?.consentement : null;
  if (statut.nouveauVisage) pastille("consentement", true, `Consentement : ${dateHeure(etat.consentement.date)}`);
  else if (consentementEnregistre) pastille("consentement", true, `Consentement : ${dateHeure(consentementEnregistre.date)}`);
  else pastille("consentement", false, "Consentement : demandé avec la capture du visage");

  pastille(
    "photo",
    statut.visageOk,
    statut.nouveauVisage
      ? `Photo : ${IMAGES_ENROLEMENT} images réunies`
      : etat.gabaritExistant
        ? "Photo : visage déjà enregistré"
        : `Photo : ${etat.enrolement.nombre} sur ${IMAGES_ENROLEMENT}`,
  );
  pastille(
    "fiche",
    statut.erreurs.length === 0,
    statut.erreurs.length === 0 ? `Fiche de ${statut.fiche.prenom || "?"} complète` : `Fiche : ${statut.erreurs.length} point(s) à corriger`,
  );

  const manque = [];
  if (!statut.visageOk) manque.push("capturer le visage (étape 1)");
  if (statut.erreurs.length) manque.push("compléter la fiche (étape 2)");
  $("#aide-enregistrer").textContent = manque.length ? `Reste à faire : ${manque.join(", ")}.` : "";
  $("#enregistrer").disabled = !statut.ok;
}

function enregistrer() {
  const statut = pretPourEnregistrer();
  if (!statut.ok) {
    etat.erreursVisibles = true;
    afficherErreurs();
    notifier(statut.erreurs[0]?.message ?? "Capturez le visage ou importez des photos.", "erreur");
    return;
  }
  const options = statut.nouveauVisage ? { gabarit: etat.enrolement.gabarit(), consentement: etat.consentement } : {};
  try {
    base.enregistrer(statut.fiche, options);
  } catch (erreur) {
    notifier(erreur.message, "erreur");
    return;
  }
  const { prenom, nom, identifiant } = statut.fiche;
  const etaitNouveau = etat.idEdition === null;
  notifier(`${prenom} ${nom} est enregistré(e).`, "succes");
  chargerClient(identifiant, { etape: 3 });
  $("#nouveau-apres").hidden = !etaitNouveau;
}

// ---------- chargement, nouveau client, suppression ----------

function reinitialiserCapture() {
  arreterCamera();
  etat.jetonClient += 1;
  etat.enrolement = new Enrolement();
  etat.mesuresEnrolement = null;
  etat.consentement = null;
  etat.dernierAjout = 0;
  const champ = $("#consentement");
  champ.value = "";
  champ.readOnly = false;
  $("#resultats-import").replaceChildren();
  $("#retour").textContent = "";
}

function chargerClient(identifiant, { etape } = {}) {
  const client = base.obtenir(identifiant);
  if (!client) return;
  reinitialiserCapture();
  etat.idEdition = identifiant;
  etat.gabaritExistant = client.aGabarit;
  etat.erreursVisibles = true; // fiche existante : ses éventuels défauts sont montrés tout de suite
  etat.dernieresErreurs = null;
  remplirFormulaire(client.fiche);
  // Renommer un client écraserait un autre client ou dupliquerait la fiche sans son visage.
  $("#f-identifiant").readOnly = true;
  $("#titre-editeur").textContent = `${client.fiche.prenom} ${client.fiche.nom}`;
  $("#sous-titre").textContent = `${identifiant} · ${client.aGabarit ? "visage enregistré" : "visage à enregistrer"}`;
  $("#gabarit-existant").hidden = !client.aGabarit;
  $("#supprimer").hidden = false;
  $("#nouveau-apres").hidden = true;
  majConsentement();
  majProgression();
  rafraichirListe();
  allerEtape(etape ?? (client.aGabarit ? 2 : 1));
}

function nouveauClient() {
  reinitialiserCapture();
  etat.idEdition = null;
  etat.gabaritExistant = false;
  etat.erreursVisibles = false;
  etat.dernieresErreurs = null;
  remplirFormulaire({
    identifiant: identifiantSuivant(base.identifiants()),
    civilite: "Madame",
    preferences: { sucre: "non", lait: "aucun" },
  });
  $("#f-identifiant").readOnly = false;
  $("#titre-editeur").textContent = "Nouveau client";
  $("#sous-titre").textContent = "Trois étapes : consentement et photo, fiche, enregistrement.";
  $("#gabarit-existant").hidden = true;
  $("#supprimer").hidden = true;
  $("#nouveau-apres").hidden = true;
  majConsentement();
  majProgression();
  rafraichirListe();
  allerEtape(1, { focus: false });
}

function ouvrirSuppression() {
  const client = base.obtenir(etat.idEdition);
  if (!client) return;
  $("#texte-suppression").textContent = `${client.fiche.prenom} ${client.fiche.nom} (${client.fiche.identifiant}). Retirer seulement le visage garde la fiche. Supprimer tout efface aussi la fiche.`;
  $("#mot-suppression").value = "";
  $("#confirmer-biometrie").disabled = !client.aGabarit;
  dialogue.showModal();
  $("#mot-suppression").focus();
}

/** La suppression n'est appliquée qu'ici, après vérification du mot : Échap ou Annuler ne suppriment jamais rien. */
function confirmerSuppression(action) {
  if ($("#mot-suppression").value.trim() !== MOT_SUPPRESSION) {
    notifier(`Tapez ${MOT_SUPPRESSION} pour confirmer.`, "erreur");
    $("#mot-suppression").focus();
    return;
  }
  dialogue.close();
  const id = etat.idEdition;
  if (action === "tout") base.supprimer(id);
  else base.retirerBiometrie(id);
  notifier(action === "tout" ? "Client supprimé." : "Visage retiré, fiche conservée.", "succes");
  if (action === "tout") nouveauClient();
  else chargerClient(id, { etape: 1 });
}

// ---------- sauvegarde ----------

function exporterBase() {
  const date = new Date().toISOString().slice(0, 10);
  telechargerTexte(`maison-test-${date}.json`, base.exporter());
}

async function importerFichier(fichier) {
  const mode = $("input[name='mode']:checked").value;
  if (mode === "remplacer" && !confirm("Remplacer toute la base par ce fichier ? Les clients actuels seront effacés.")) return;
  try {
    const resultat = base.importer(await fichier.text(), { mode });
    notifier(`Import : ${resultat.ajoutes} ajouté(s), ${resultat.misAJour} mis à jour.`, "succes");
    if (etat.idEdition && base.obtenir(etat.idEdition)) chargerClient(etat.idEdition, { etape: etat.etape });
    else nouveauClient();
  } catch (erreur) {
    notifier(`Import refusé : ${erreur.message}`, "erreur");
  }
}

// ---------- initialisation ----------

function initialiserChoix() {
  $("#f-lait").replaceChildren(...LAITS.map((l) => creer("option", { value: l }, l)));
  $("#boissons").replaceChildren(...BOISSONS_SUGGEREES.map((b) => creer("option", { value: b })));
}

function branchements() {
  $("#nouveau").addEventListener("click", nouveauClient);
  $("#recherche").addEventListener("input", rafraichirListe);
  $("#consentement").addEventListener("input", majConsentement);
  $("#activer").addEventListener("click", activerCamera);
  $("#arreter-camera").addEventListener("click", () => {
    arreterCamera();
    retour("Caméra arrêtée.");
    $("#activer").focus();
  });
  $("#pause").addEventListener("click", () => {
    etat.enPause = !etat.enPause;
    $("#pause").textContent = etat.enPause ? "Reprendre" : "Pause";
    retour(etat.enPause ? "Capture en pause." : "Regardez la caméra.");
  });
  $("#recommencer").addEventListener("click", recommencerCapture);

  const zone = $("#zone-depot");
  const fichiers = $("#fichiers");
  fichiers.addEventListener("change", () => {
    importerPhotos([...fichiers.files]);
    fichiers.value = "";
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!fichiers.disabled) zone.classList.add("survol");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("survol"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("survol");
    if (!fichiers.disabled) importerPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  $("#ajouter-achat").addEventListener("click", () => ajouterLigneAchat());
  const formulaire = $("#formulaire");
  formulaire.addEventListener("input", actualiserFormulaire);
  formulaire.addEventListener("change", actualiserFormulaire);
  // Les erreurs apparaissent dès qu'on quitte un champ, pas pendant la première saisie.
  formulaire.addEventListener("focusout", () => {
    if (etat.erreursVisibles) return;
    etat.erreursVisibles = true;
    afficherErreurs();
  });

  $("#etapes").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-etape]");
    if (li) allerEtape(Number(li.dataset.etape));
  });
  $("#suivant").addEventListener("click", () => {
    if (etat.etape === 2) {
      etat.erreursVisibles = true;
      if (afficherErreurs().length > 0) {
        notifier("Corrigez les points signalés dans la fiche.", "erreur");
        return;
      }
    }
    allerEtape(etat.etape + 1);
  });
  $("#precedent").addEventListener("click", () => allerEtape(etat.etape - 1));

  $("#enregistrer").addEventListener("click", enregistrer);
  $("#nouveau-apres").addEventListener("click", nouveauClient);
  $("#supprimer").addEventListener("click", ouvrirSuppression);
  $("#annuler-suppression").addEventListener("click", () => dialogue.close());
  $("#confirmer-biometrie").addEventListener("click", () => confirmerSuppression("biometrie"));
  $("#confirmer-tout").addEventListener("click", () => confirmerSuppression("tout"));
  $("#mot-suppression").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault(); // pas de validation implicite : il faut choisir l'action
  });

  $("#exporter").addEventListener("click", exporterBase);
  $("#importer").addEventListener("change", (e) => {
    const fichier = e.target.files[0];
    if (fichier) importerFichier(fichier);
    e.target.value = "";
  });
}

initialiserChoix();
branchements();
nouveauClient();
