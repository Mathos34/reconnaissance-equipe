// Fiches clients : règles de validation et helpers. Une seule source de vérité, utilisée par le formulaire et la base.

export const CIVILITES = ["Madame", "Monsieur"];
export const TEMPERATURES = ["chaud", "froid"];
export const LAITS = ["aucun", "lait entier", "lait demi-écrémé", "lait d'amande", "lait d'avoine", "lait de soja"];
export const BOISSONS_SUGGEREES = [
  "café",
  "café glacé",
  "thé chaud au miel",
  "thé glacé",
  "espresso serré",
  "chocolat chaud",
  "cappuccino",
];

const MOTIF_IDENTIFIANT = /^[A-Za-z0-9_-]{1,20}$/;
const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOTIF_DATE_HEURE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export class FicheInvalide extends Error {}

const estTexteNonVide = (v) => typeof v === "string" && v.trim().length > 0;

/** Liste des erreurs de la fiche, en français, avec le champ concerné. Vide si la fiche est valide. */
export function erreursFiche(fiche) {
  const erreurs = [];
  const ajouter = (champ, message) => erreurs.push({ champ, message });

  if (!estTexteNonVide(fiche.identifiant) || !MOTIF_IDENTIFIANT.test(fiche.identifiant)) {
    ajouter("identifiant", "Identifiant : 1 à 20 lettres, chiffres, tirets ou tirets bas");
  }
  if (!CIVILITES.includes(fiche.civilite)) ajouter("civilite", "Choisissez une civilité");
  if (!estTexteNonVide(fiche.prenom)) ajouter("prenom", "Le prénom est obligatoire");
  if (!estTexteNonVide(fiche.nom)) ajouter("nom", "Le nom est obligatoire");
  if (!estTexteNonVide(fiche.conseiller)) ajouter("conseiller", "Choisissez le conseiller attitré");

  const p = fiche.preferences || {};
  if (!estTexteNonVide(p.boisson)) ajouter("boisson", "Indiquez la boisson préférée");
  if (!TEMPERATURES.includes(p.temperature)) ajouter("temperature", "Choisissez chaud ou froid");
  const sucreValide = p.sucre === "non" || (Number.isInteger(p.sucre) && p.sucre >= 0);
  if (!sucreValide) ajouter("sucre", "Sucre : « non » ou un nombre de morceaux");
  if (!estTexteNonVide(p.lait)) ajouter("lait", "Indiquez le lait");

  for (const achat of fiche.derniers_achats || []) {
    if (!MOTIF_DATE.test(achat.date || "") || Number.isNaN(Date.parse(achat.date))) {
      ajouter("derniers_achats", "Achat : date au format AAAA-MM-JJ");
      break;
    }
    if (!estTexteNonVide(achat.article)) {
      ajouter("derniers_achats", "Achat : indiquez l'article");
      break;
    }
    if (!(typeof achat.montant === "number" && achat.montant >= 0)) {
      ajouter("derniers_achats", "Achat : montant positif");
      break;
    }
  }

  if (fiche.prochain_rendez_vous && !MOTIF_DATE_HEURE.test(fiche.prochain_rendez_vous)) {
    ajouter("prochain_rendez_vous", "Rendez-vous : date et heure valides");
  }
  return erreurs;
}

/** Lève FicheInvalide avec le premier message d'erreur si la fiche n'est pas valide. */
export function validerFiche(fiche) {
  const erreurs = erreursFiche(fiche);
  if (erreurs.length > 0) {
    throw new FicheInvalide(`Fiche ${fiche.identifiant ?? "?"} : ${erreurs[0].message}`);
  }
}

/** Prochain identifiant libre de la forme C001, C002... à partir des identifiants existants. */
export function identifiantSuivant(identifiantsExistants) {
  let max = 0;
  for (const id of identifiantsExistants) {
    const numero = /^C(\d+)$/.exec(id);
    if (numero) max = Math.max(max, Number(numero[1]));
  }
  return `C${String(max + 1).padStart(3, "0")}`;
}

/** Initiales pour l'avatar d'un client, par exemple « CT » pour Claire Test. */
export function initiales(fiche) {
  const prenom = (fiche.prenom || "").trim().charAt(0);
  const nom = (fiche.nom || "").trim().charAt(0);
  return (prenom + nom).toUpperCase() || "?";
}
