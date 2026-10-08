// Outils d'interface communs aux deux pages. Tout le texte passe par textContent : aucune donnée n'est lue comme du HTML.

export const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
export const $$ = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)];

/** Crée un élément avec des attributs et des enfants (texte ou éléments). */
export function creer(balise, attributs = {}, enfants = []) {
  const el = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (cle === "class") el.className = valeur;
    else if (cle === "dataset") Object.assign(el.dataset, valeur);
    else if (cle.startsWith("on") && typeof valeur === "function") el.addEventListener(cle.slice(2), valeur);
    else if (valeur === true) el.setAttribute(cle, "");
    else if (valeur !== false && valeur !== null && valeur !== undefined) el.setAttribute(cle, valeur);
  }
  for (const enfant of [].concat(enfants)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    el.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return el;
}

/** Message bref en bas de page. type : "info", "succes" ou "erreur". */
export function notifier(message, type = "info") {
  const zone = $("#notifications");
  if (!zone) return;
  const bulle = creer("div", { class: `notification ${type}`, role: "status" }, message);
  zone.append(bulle);
  setTimeout(() => bulle.remove(), type === "erreur" ? 7000 : 4000);
}

export function formaterMontant(montant) {
  return `${Number(montant).toLocaleString("fr-FR")} €`;
}

/** "2026-10-20T10:30:00" -> "20/10/2026 à 10 h 30". */
export function formaterRendezVous(iso) {
  if (!iso) return "Aucun rendez-vous prévu";
  const [jour, heure] = iso.split("T");
  const [annee, mois, j] = jour.split("-");
  const [h, min] = heure.split(":");
  return `${j}/${mois}/${annee} à ${h} h ${min}`;
}

export function telechargerTexte(nomFichier, contenu, type = "application/json") {
  const blob = new Blob([contenu], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const lien = creer("a", { href: url, download: nomFichier });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function lireFichierTexte(fichier) {
  return fichier.text();
}

/** Attend un délai, pour laisser respirer l'interface entre deux analyses. */
export const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
