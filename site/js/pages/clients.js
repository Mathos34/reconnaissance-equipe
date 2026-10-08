// Page Clients : fiche, photo (capture guidée ou import), consentement et enregistrement dans la base du navigateur.

import { CLE_BASE, IMAGES_ENROLEMENT } from "../config.js";
import { Base } from "../coeur/base.js";
import { Enrolement, evaluerImage, indicePose, POSES } from "../coeur/enrolement.js";
import { BOISSONS_SUGGEREES, LAITS, erreursFiche, identifiantSuivant, initiales } from "../coeur/fiche.js";
import { formaterDate } from "../coeur/suggestion.js";
import { $, $$, creer, notifier, telechargerTexte } from "../navigateur/commun.js";
import { ouvrirCamera } from "../navigateur/camera.js";
import { Analyseur } from "../navigateur/analyseur.js";
import { choisirStockage } from "../navigateur/stockage.js";

const MENTION = "J'ACCEPTE";
const MOT_SUPPRESSION = "SUPPRIMER";
const { stockage } = choisirStockage();
const base = new Base(stockage, CLE_BASE);

const video = $("#video");
const canevas = $("#superposition");
const ctx = canevas.getContext("2d");

const etat = {
  etape: 1,
  idEdition: null,
  enrolement: new Enrolement(),
  gabaritExistant: false,
  analyseur: null,
  arreterCamera: null,
  timer: null,
  enPause: false,
  occupe: false,
  dernierAjout: 0,
};

// ---------- utilitaires ----------

const consentementValide = (texte) => texte.trim().replace(/’/g, "'").toLowerCase() === MENTION.toLowerCase();

function retour(message, niveau = "info") {
  const el = $("#retour");
  el.textContent = message;
  el.dataset.niveau = niveau;
}

function listeDepuisTexte(texte) {
  return texte
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- liste des clients ----------

function rafraichirListe() {
  const filtre = $("#recherche").value.trim().toLowerCase();
  const clients = base
    .lister()
    .filter((c) => !filtre || `${c.fiche.prenom} ${c.fiche.nom} ${c.identifiant}`.toLowerCase().includes(filtre));
  const liste = $("#liste");
  liste.replaceChildren(
    ...clients.map((c) => {
      const ligne = creer(
        "li",
        {
          class: `ligne-client${c.identifiant === etat.idEdition ? " selection" : ""}`,
          tabindex: 0,
          role: "button",
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
          creer(
            "span",
            { class: `badge ${c.aGabarit ? "ok" : "attente"}` },
            c.aGabarit ? "Visage enregistré" : "Visage à enregistrer",
          ),
        ],
      );
      return ligne;
    }),
  );
  $("#liste-vide").hidden = clients.length > 0;
}

// ---------- formulaire ----------

function ajouterLigneAchat(achat = {}) {
  const ligne = creer("div", { class: "achat" }, [
    creer("input", { type: "date", name: "achat-date", "aria-label": "Date de l'achat", value: achat.date ?? "" }),
    creer("input", { name: "achat-article", placeholder: "Article", "aria-label": "Article", value: achat.article ?? "" }),
    creer("input", { type: "number", min: "0", step: "1", name: "achat-montant", placeholder: "€", "aria-label": "Montant en euros", value: achat.montant ?? "" }),
    creer("button", { type: "button", class: "bouton discret petit retirer", "aria-label": "Retirer cet achat", onclick: () => { ligne.remove(); afficherErreurs(); } }, "×"),
  ]);
  $("#achats").append(ligne);
}

function lireAchats() {
  return $$("#achats .achat")
    .map((ligne) => ({
      date: ligne.querySelector('[name="achat-date"]').value,
      article: ligne.querySelector('[name="achat-article"]').value.trim(),
      montant: ligne.querySelector('[name="achat-montant"]').value === "" ? undefined : Number(ligne.querySelector('[name="achat-montant"]').value),
    }))
    .filter((a) => a.date || a.article || a.montant !== undefined);
}

function lireFormulaire() {
  const formulaire = $("#formulaire");
  const valeur = (nom) => (formulaire.elements[nom]?.value ?? "").toString().trim();
  const temperature = formulaire.querySelector('[name="temperature"]:checked')?.value ?? "";
  const sucreBrut = valeur("sucre");
  const sucre = sucreBrut === "" ? undefined : sucreBrut === "non" ? "non" : Number(sucreBrut);
  const achats = lireAchats().filter((a) => a.montant !== undefined || a.article || a.date);
  return {
    identifiant: valeur("identifiant"),
    civilite: valeur("civilite"),
    prenom: valeur("prenom"),
    nom: valeur("nom"),
    conseiller: valeur("conseiller"),
    preferences: { boisson: valeur("boisson"), temperature, sucre, lait: valeur("lait") },
    taille_vetement: valeur("taille_vetement"),
    styles: listeDepuisTexte(valeur("styles")),
    cadeaux_notes: listeDepuisTexte(valeur("cadeaux_notes")),
    derniers_achats: achats.map((a) => ({ date: a.date, article: a.article, montant: a.montant })),
    notes: valeur("notes"),
    prochain_rendez_vous: valeur("prochain_rendez_vous") || null,
  };
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
  formulaire.elements.sucre.value = fiche.preferences?.sucre === undefined ? "non" : String(fiche.preferences.sucre);
  formulaire.elements.lait.value = fiche.preferences?.lait ?? "aucun";
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

function afficherErreurs() {
  const { erreurs } = erreursComplete();
  const zone = $("#erreurs-formulaire");
  zone.replaceChildren(...erreurs.map((e) => creer("p", {}, e.message)));
  zone.hidden = erreurs.length === 0;
  return erreurs;
}

// ---------- étapes ----------

function allerEtape(numero) {
  if (etat.etape === 1 && numero !== 1) arreterCamera();
  etat.etape = numero;
  for (const n of [1, 2, 3]) $(`#etape-${n}`).hidden = n !== numero;
  $$("#etapes li").forEach((li) => {
    const n = Number(li.dataset.etape);
    li.classList.toggle("active", n === numero);
    li.classList.toggle("fait", n < numero);
  });
  $("#precedent").hidden = numero === 1;
  $("#suivant").hidden = numero === 3;
  if (numero === 3) rafraichirRecapitulatif();
  if (numero === 2) afficherErreurs();
}

// ---------- capture du visage ----------

function majProgression() {
  const n = etat.enrolement.nombre;
  const cible = etat.enrolement.cible;
  const termine = etat.enrolement.termine;
  $("#compte").textContent = String(n);
  $("#cible").textContent = String(cible);
  $("#barre").style.width = `${(n / cible) * 100}%`;
  $("#consigne").textContent = termine ? "Capture terminée. Passez à la fiche." : etat.enrolement.consigne();
  const posesFaites = Math.floor(n / (cible / POSES.length));
  $$("#poses li").forEach((li) => {
    const i = Number(li.dataset.pose);
    li.classList.toggle("fait", i < posesFaites);
    li.classList.toggle("courante", !termine && i === indicePose(n, cible / POSES.length));
  });
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
  for (const v of visages) {
    const [x1, y1, x2, y2] = v.boite;
    ctx.strokeStyle = valide ? "#3f8a5a" : "#c98a2b";
    ctx.lineWidth = Math.max(3, Math.round(largeur / 300));
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
}

async function capturerUneImage() {
  if (etat.occupe || etat.enPause || etat.enrolement.termine || !etat.analyseur || video.readyState < 2) return;
  etat.occupe = true;
  try {
    const visages = await etat.analyseur.analyser(video, video.videoWidth, video.videoHeight, { embeddings: true });
    const { visage, raison } = evaluerImage(visages);
    dessinerCadre(visages, Boolean(visage));
    if (!visage) {
      retour(raison ?? "Regardez la caméra", "attention");
      return;
    }
    // Un intervalle minimal entre deux images retenues : les poses ont le temps de changer.
    if (Date.now() - etat.dernierAjout < 450) return;
    etat.enrolement.ajouter(visage.embedding);
    etat.dernierAjout = Date.now();
    majProgression();
    if (etat.enrolement.termine) {
      arreterBoucleCapture();
      arreterCamera();
      retour("Capture terminée : 25 images valides.", "ok");
      notifier("Visage enregistré. Passez à la fiche.", "succes");
    } else {
      retour(`Image retenue (${etat.enrolement.nombre} sur ${etat.enrolement.cible}).`, "ok");
    }
  } catch (erreur) {
    notifier(`Capture interrompue : ${erreur.message}`, "erreur");
    arreterBoucleCapture();
  } finally {
    etat.occupe = false;
  }
}

function demarrerBoucleCapture() {
  arreterBoucleCapture();
  etat.timer = setInterval(capturerUneImage, 180);
}

function arreterBoucleCapture() {
  if (etat.timer) clearInterval(etat.timer);
  etat.timer = null;
}

function arreterCamera() {
  arreterBoucleCapture();
  etat.arreterCamera?.();
  etat.arreterCamera = null;
  ctx.clearRect(0, 0, canevas.width, canevas.height);
  $("#voile-capture").hidden = false;
  const bouton = $("#activer");
  bouton.textContent = etat.enrolement.termine ? "Caméra fermée" : "Reprendre la capture";
  bouton.disabled = etat.enrolement.termine;
}

async function activerCamera() {
  const bouton = $("#activer");
  bouton.disabled = true;
  try {
    if (!etat.analyseur) {
      retour("Chargement des modèles (la première fois seulement)...");
      etat.analyseur = await Analyseur.charger({ onProgression: (t) => retour(t) });
    }
    etat.arreterCamera = await ouvrirCamera(video);
    $("#voile-capture").hidden = true;
    etat.enPause = false;
    $("#pause").hidden = false;
    $("#pause").textContent = "Pause";
    demarrerBoucleCapture();
    retour("Regardez la caméra.");
  } catch (erreur) {
    retour(erreur.message, "erreur");
    notifier(erreur.message, "erreur");
    etat.arreterCamera?.();
    etat.arreterCamera = null;
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Activer la caméra";
  }
}

function recommencerCapture() {
  etat.enrolement = new Enrolement();
  etat.dernierAjout = 0;
  $("#resultats-import").replaceChildren();
  majProgression();
  retour("Capture remise à zéro.");
  if (etat.arreterCamera) demarrerBoucleCapture();
  else $("#voile-capture").hidden = false;
}

async function importerPhotos(fichiers) {
  if (!etat.analyseur) {
    retour("Chargement des modèles (la première fois seulement)...");
    etat.analyseur = await Analyseur.charger({ onProgression: (t) => retour(t) });
  }
  const resultats = $("#resultats-import");
  for (const fichier of fichiers) {
    if (etat.enrolement.termine) {
      notifier("Les 25 images sont déjà réunies. Recommencez pour importer d'autres photos.", "info");
      break;
    }
    const ligne = creer("li", {}, `${fichier.name} : analyse...`);
    resultats.append(ligne);
    try {
      const bitmap = await createImageBitmap(fichier);
      const visages = await etat.analyseur.analyser(bitmap, bitmap.width, bitmap.height, { embeddings: true });
      bitmap.close?.();
      const { visage, raison } = evaluerImage(visages);
      if (visage) {
        etat.enrolement.ajouter(visage.embedding);
        ligne.textContent = `${fichier.name} : retenue`;
        ligne.className = "ok";
      } else {
        ligne.textContent = `${fichier.name} : refusée. ${raison}`;
        ligne.className = "attention";
      }
    } catch {
      ligne.textContent = `${fichier.name} : fichier illisible`;
      ligne.className = "attention";
    }
    majProgression();
  }
}

// ---------- enregistrement ----------

function pretPourEnregistrer() {
  const { fiche, erreurs } = erreursComplete();
  const nouveauVisage = etat.enrolement.termine;
  const visageOk = nouveauVisage || etat.gabaritExistant;
  const consentOk = !nouveauVisage || consentementValide($("#consentement").value);
  return { fiche, erreurs, nouveauVisage, visageOk, consentOk, ok: erreurs.length === 0 && visageOk && consentOk };
}

function rafraichirRecapitulatif() {
  const { fiche, erreurs } = erreursComplete();
  const nouveau = etat.enrolement.termine;
  const photoOk = nouveau || etat.gabaritExistant;
  $("#ok-photo").classList.toggle("ok", photoOk);
  $("#texte-photo").textContent = nouveau
    ? `Photo : ${IMAGES_ENROLEMENT} images réunies`
    : etat.gabaritExistant
      ? "Photo : visage déjà enregistré"
      : `Photo : ${etat.enrolement.nombre} sur ${IMAGES_ENROLEMENT}`;
  $("#ok-fiche").classList.toggle("ok", erreurs.length === 0);
  $("#texte-fiche").textContent = erreurs.length === 0 ? `Fiche de ${fiche.prenom || "?"} complète` : `Fiche : ${erreurs.length} point(s) à corriger`;

  const consent = $("#consentement");
  const aide = $("#consentement-aide");
  consent.disabled = !nouveau;
  if (!nouveau) {
    const consentement = etat.idEdition ? base.obtenir(etat.idEdition)?.consentement : null;
    aide.textContent = etat.gabaritExistant
      ? consentement
        ? `Consentement enregistré le ${formaterDate(new Date(consentement.date))}. Sans nouvelle capture, il reste valable.`
        : "Aucune nouvelle capture : le visage enregistré reste en place."
      : "Le consentement est demandé avec la capture du visage.";
  } else if (consent.value && !consentementValide(consent.value)) {
    aide.textContent = `Tapez exactement ${MENTION} (sans guillemets).`;
  } else {
    aide.textContent = "";
  }
  const statut = pretPourEnregistrer();
  $("#enregistrer").disabled = !statut.ok;
}

function enregistrer() {
  const statut = pretPourEnregistrer();
  if (!statut.ok) {
    notifier(statut.erreurs[0]?.message ?? (statut.visageOk ? "Tapez J'ACCEPTE pour confirmer" : "Capturez le visage ou importez des photos"), "erreur");
    return;
  }
  const options = {};
  if (statut.nouveauVisage) {
    options.gabarit = etat.enrolement.gabarit();
    options.consentement = { date: new Date().toISOString(), mention: MENTION };
  }
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

function chargerClient(identifiant, { etape } = {}) {
  const client = base.obtenir(identifiant);
  if (!client) return;
  arreterCamera();
  etat.idEdition = identifiant;
  etat.enrolement = new Enrolement();
  etat.gabaritExistant = client.aGabarit;
  remplirFormulaire(client.fiche);
  $("#titre-editeur").textContent = `${client.fiche.prenom} ${client.fiche.nom}`;
  $("#sous-titre").textContent = `${identifiant} · ${client.aGabarit ? "visage enregistré" : "visage à enregistrer"}`;
  $("#gabarit-existant").hidden = !client.aGabarit;
  $("#supprimer").hidden = false;
  $("#nouveau-apres").hidden = true;
  $("#consentement").value = "";
  majProgression();
  rafraichirListe();
  allerEtape(etape ?? (client.aGabarit ? 2 : 1));
  afficherErreurs();
}

function nouveauClient() {
  arreterCamera();
  etat.idEdition = null;
  etat.enrolement = new Enrolement();
  etat.gabaritExistant = false;
  remplirFormulaire({
    identifiant: identifiantSuivant(base.identifiants()),
    civilite: "Madame",
    preferences: { sucre: "non", lait: "aucun" },
  });
  $("#titre-editeur").textContent = "Nouveau client";
  $("#sous-titre").textContent = "Trois étapes : photo, fiche, enregistrement.";
  $("#gabarit-existant").hidden = true;
  $("#supprimer").hidden = true;
  $("#nouveau-apres").hidden = true;
  $("#consentement").value = "";
  $("#resultats-import").replaceChildren();
  majProgression();
  rafraichirListe();
  allerEtape(1);
}

function ouvrirSuppression() {
  const client = base.obtenir(etat.idEdition);
  if (!client) return;
  $("#texte-suppression").textContent = `${client.fiche.prenom} ${client.fiche.nom} (${client.fiche.identifiant}). Retirer seulement le visage garde la fiche. Supprimer tout efface aussi la fiche.`;
  $("#mot-suppression").value = "";
  $("#confirmer-biometrie").disabled = !client.aGabarit;
  $("#dialogue-suppression").showModal();
}

function appliquerSuppression(action) {
  const id = etat.idEdition;
  if (!id) return;
  if (action === "tout") base.supprimer(id);
  else base.retirerBiometrie(id);
  notifier(action === "tout" ? "Client supprimé." : "Visage retiré, fiche conservée.", "succes");
  if (action === "tout") nouveauClient();
  else chargerClient(id, { etape: 2 });
}

// ---------- sauvegarde ----------

function exporterBase() {
  const date = formaterDate(new Date()).replaceAll("/", "-");
  telechargerTexte(`maison-test-${date}.json`, base.exporter());
}

async function importerFichier(fichier) {
  const mode = $("input[name='mode']:checked").value;
  if (mode === "remplacer" && !confirm("Remplacer toute la base par ce fichier ? Les clients actuels seront effacés.")) return;
  try {
    const resultat = base.importer(await fichier.text(), { mode });
    notifier(`Import : ${resultat.ajoutes} ajouté(s), ${resultat.misAJour} mis à jour.`, "succes");
    rafraichirListe();
    if (etat.idEdition && base.obtenir(etat.idEdition)) chargerClient(etat.idEdition, { etape: etat.etape });
    else nouveauClient();
  } catch (erreur) {
    notifier(`Import refusé : ${erreur.message}`, "erreur");
  }
}

// ---------- initialisation ----------

function initialiserChoix() {
  const selectLait = $("#f-lait");
  selectLait.replaceChildren(...LAITS.map((l) => creer("option", { value: l }, l)));
  $("#boissons").replaceChildren(...BOISSONS_SUGGEREES.map((b) => creer("option", { value: b })));
}

function branchements() {
  $("#nouveau").addEventListener("click", nouveauClient);
  $("#recherche").addEventListener("input", rafraichirListe);
  $("#activer").addEventListener("click", () => (etat.arreterCamera ? arreterCamera() : activerCamera()));
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
    zone.classList.add("survol");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("survol"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("survol");
    importerPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  $("#ajouter-achat").addEventListener("click", () => ajouterLigneAchat());
  const formulaire = $("#formulaire");
  const actualiserFormulaire = () => {
    afficherErreurs();
    rafraichirRecapitulatif();
  };
  formulaire.addEventListener("input", actualiserFormulaire);
  formulaire.addEventListener("change", actualiserFormulaire);

  $("#etapes").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-etape]");
    if (li) allerEtape(Number(li.dataset.etape));
  });
  $("#suivant").addEventListener("click", () => {
    if (etat.etape === 2 && afficherErreurs().length > 0) {
      notifier("Corrigez les points signalés dans la fiche.", "erreur");
      return;
    }
    allerEtape(etat.etape + 1);
  });
  $("#precedent").addEventListener("click", () => allerEtape(etat.etape - 1));

  $("#consentement").addEventListener("input", rafraichirRecapitulatif);
  $("#enregistrer").addEventListener("click", enregistrer);
  $("#nouveau-apres").addEventListener("click", nouveauClient);
  $("#supprimer").addEventListener("click", ouvrirSuppression);

  const dialogue = $("#dialogue-suppression");
  for (const id of ["#confirmer-biometrie", "#confirmer-tout"]) {
    $(id).addEventListener("click", (e) => {
      if ($("#mot-suppression").value.trim() !== MOT_SUPPRESSION) {
        e.preventDefault();
        notifier(`Tapez ${MOT_SUPPRESSION} pour confirmer.`, "erreur");
      }
    });
  }
  dialogue.addEventListener("close", () => {
    if (dialogue.returnValue === "tout" || dialogue.returnValue === "biometrie") appliquerSuppression(dialogue.returnValue);
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
rafraichirListe();
nouveauClient();
