// Page Indicateurs : synthèse des mesures enregistrées (journal) et des fiches (base), avec graphiques.

import { CLE_BASE, SEUIL } from "../config.js";
import { Base } from "../coeur/base.js";
import { JournalIndicateurs, synthetiser } from "../coeur/indicateurs.js";
import { $, creer, notifier, telechargerTexte } from "../navigateur/commun.js";
import { barresHorizontales, colonnes } from "../navigateur/graphiques.js";
import { choisirStockage } from "../navigateur/stockage.js";

const { stockage } = choisirStockage();
const base = new Base(stockage, CLE_BASE);
const journal = new JournalIndicateurs(stockage);

const SERIE_1 = "var(--serie-1)";
const SERIE_2 = "var(--serie-2)";
const SERIE_3 = "var(--serie-3)";
const SANS_SESSION = "Aucune session enregistrée. Lancez la caméra depuis la page Reconnaissance, puis arrêtez-la.";

const nombre = (v, decimales = 0) =>
  v === null || v === undefined ? "-" : v.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

function tuile(libelle, valeur, detail = "") {
  return creer("div", { class: "tuile" }, [creer("dt", {}, libelle), creer("dd", {}, valeur), detail ? creer("p", { class: "detail" }, detail) : null]);
}

function libelleSession(entree, index) {
  const date = new Date(entree.date);
  return `${index + 1}`.padStart(2, "0") + (Number.isNaN(date.getTime()) ? "" : ` · ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
}

function afficher() {
  const s = synthetiser(journal.lister(), base.lister());
  const historique = s.historique.slice(-12);

  $("#perimetre").textContent = `Mesures enregistrées par ce navigateur : ${s.sessions} session(s) de reconnaissance, ${s.enrolements} enrôlement(s).`;

  $("#tuiles").replaceChildren(
    tuile("Clients enregistrés", nombre(s.clients), `${nombre(s.clientsAvecVisage)} avec un visage enregistré`),
    tuile("Images par seconde", nombre(s.fpsMedian, 1), "médiane des sessions, affichage"),
    tuile("Analyses par seconde", nombre(s.analysesMedian, 1), "détection et reconnaissance"),
    tuile("Temps d'analyse", s.latenceMedianeMs === null ? "-" : `${nombre(s.latenceMedianeMs)} ms`, "détection et reconnaissance"),
    tuile("Reconnu en", s.delaiMedianMs === null ? "-" : `${nombre(s.delaiMedianMs / 1000, 1)} s`, "médiane, de l'apparition à la fiche"),
    tuile("Chargement des modèles", s.chargementMedianMs === null ? "-" : `${nombre(s.chargementMedianMs / 1000, 1)} s`, "première ouverture plus lente"),
    tuile("Durée d'enrôlement", s.dureeEnrolementMedianeS === null ? "-" : `${nombre(s.dureeEnrolementMedianeS, 1)} s`, "25 images valides"),
    tuile("Images valides", s.tauxValidesMoyen === null ? "-" : `${nombre(s.tauxValidesMoyen, 0)} %`, "pendant l'enrôlement"),
    tuile("Panier moyen", s.panierMoyen === null ? "-" : `${nombre(s.panierMoyen)} €`, "d'après les derniers achats"),
    tuile("Sessions enregistrées", nombre(s.sessions), `${nombre(s.enrolements)} enrôlement(s)`),
  );

  const categories = historique.map(libelleSession);
  colonnes($("#g-latence"), {
    categories,
    series: [
      { nom: "Prétraitement", valeurs: historique.map((h) => h.pretraitement), couleur: SERIE_1 },
      { nom: "Détection", valeurs: historique.map((h) => h.inference), couleur: SERIE_2 },
      { nom: "Reconnaissance", valeurs: historique.map((h) => h.embedding), couleur: SERIE_3 },
    ],
    format: (v) => nombre(v),
    unite: "ms",
    titreAccessible: "Temps d'analyse par étape et par session",
    messageVide: SANS_SESSION,
  });
  colonnes($("#g-fps"), {
    categories,
    series: [{ nom: "Images par seconde", valeurs: historique.map((h) => h.fps), couleur: SERIE_1 }],
    format: (v) => nombre(v, 1),
    titreAccessible: "Images par seconde par session",
    messageVide: SANS_SESSION,
  });
  colonnes($("#g-delai"), {
    categories: historique.filter((h) => h.delai !== null).map((h, i) => libelleSession(h, i)),
    series: [{ nom: "Délai", valeurs: historique.filter((h) => h.delai !== null).map((h) => +(h.delai / 1000).toFixed(2)), couleur: SERIE_1 }],
    format: (v) => nombre(v, 1),
    unite: "s",
    titreAccessible: "Délai avant reconnaissance par session",
    messageVide: "Aucune reconnaissance enregistrée pour l'instant.",
  });

  const classes = s.histogrammeScores.filter((c) => c.debut >= -0.1);
  const total = classes.reduce((t, c) => t + c.n, 0);
  const min = classes[0]?.debut ?? 0;
  const max = classes[classes.length - 1]?.fin ?? 1;
  colonnes($("#g-scores"), {
    categories: total ? classes.map((c) => nombre(c.debut, 2)) : [],
    series: [{ nom: "Visages analysés", valeurs: classes.map((c) => c.n), couleur: SERIE_1 }],
    format: (v) => nombre(v),
    titreAccessible: "Distribution des scores de similarité",
    messageVide: SANS_SESSION,
    marqueur: { position: (SEUIL - min) / (max - min), libelle: `seuil ${nombre(SEUIL, 2)}` },
  });

  const issues = Object.entries(s.refus).map(([libelle, valeur]) => ({ libelle, valeur }));
  const retenues = journal.lister("enrolement").reduce((t, e) => t + e.imagesRetenues, 0);
  barresHorizontales($("#g-enrolement"), {
    donnees: retenues ? [{ libelle: "Retenues", valeur: retenues }, ...issues.sort((a, b) => b.valeur - a.valeur)] : [],
    format: (v) => nombre(v),
    titreAccessible: "Issues des images analysées pendant l'enrôlement",
    messageVide: "Aucun enrôlement terminé pour l'instant.",
  });

  barresHorizontales($("#g-boissons"), {
    donnees: Object.entries(s.boissons)
      .map(([libelle, valeur]) => ({ libelle, valeur }))
      .sort((a, b) => b.valeur - a.valeur),
    format: (v) => nombre(v),
    titreAccessible: "Nombre de clients par boisson préférée",
    messageVide: "Aucun client enregistré.",
  });
}

$("#exporter").addEventListener("click", () => {
  const date = new Date().toISOString().slice(0, 10);
  telechargerTexte(`maison-test-indicateurs-${date}.json`, journal.exporter());
});
$("#effacer").addEventListener("click", () => {
  if (!confirm("Effacer toutes les mesures enregistrées dans ce navigateur ? Les clients ne sont pas touchés.")) return;
  journal.vider();
  afficher();
  notifier("Historique des mesures effacé.", "succes");
});
window.addEventListener("storage", afficher);

afficher();
