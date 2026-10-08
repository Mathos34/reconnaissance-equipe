// Affichage en direct de la fiche client. Les données viennent du serveur local (/evenements).
// Tout le texte est inséré avec textContent : aucune donnée n'est interprétée comme du HTML.

const $ = (id) => document.getElementById(id);

const etat = { masquee: false, derniere: null };

function formaterDate(iso) {
  // "2026-10-20" -> "20/10/2026"
  const [annee, mois, jour] = iso.split("-");
  return `${jour}/${mois}/${annee}`;
}

function formaterRendezVous(iso) {
  // "2026-10-20T10:30:00" -> "20/10/2026 à 10 h 30"
  if (!iso) return "Aucun rendez-vous prévu";
  const [jour, heure] = iso.split("T");
  const [h, min] = heure.split(":");
  return `${formaterDate(jour)} à ${h} h ${min}`;
}

function formaterMontant(montant) {
  return `${Number(montant).toLocaleString("fr-FR")} €`;
}

function remplirFiche(personne) {
  const pref = personne.preferences;
  const sugg = personne.suggestion;

  $("conseiller-attitre").textContent = `Conseiller attitré : ${personne.conseiller}`;
  $("nom-complet").textContent = `${personne.civilite} ${personne.prenom} ${personne.nom}`;

  const reperes = [];
  if (personne.taille_vetement) reperes.push(`Taille ${personne.taille_vetement}`);
  if (personne.styles.length) reperes.push(personne.styles.join(", "));
  $("repere").textContent = reperes.join(" · ");

  $("boisson").textContent = sugg.boisson;
  $("temperature").textContent = sugg.temperature;
  $("sucre").textContent = sugg.sucre;
  $("lait").textContent = sugg.lait;

  $("accroche").textContent = sugg.accroche;

  const achats = $("achats");
  achats.replaceChildren();
  if (personne.derniers_achats.length === 0) {
    const vide = document.createElement("li");
    vide.textContent = "Aucun achat enregistré";
    achats.appendChild(vide);
  }
  for (const achat of personne.derniers_achats) {
    const ligne = document.createElement("li");
    ligne.textContent = `${formaterDate(achat.date)} · ${achat.article} · ${formaterMontant(achat.montant)}`;
    achats.appendChild(ligne);
  }

  $("notes").textContent = personne.notes || "Aucune note.";
  $("rdv").textContent = formaterRendezVous(personne.prochain_rendez_vous);
}

function rendre(donnees) {
  $("nom-boutique").textContent = donnees.nom_boutique;
  $("titre-accueil").textContent = donnees.nom_boutique;
  $("fps").textContent = donnees.fps ? `${donnees.fps} fps` : "";

  const statut = $("statut");
  statut.textContent = donnees.statut === "ok" ? "Caméra active" : "Caméra indisponible";

  // Une erreur remplace le message de caméra ; un avertissement (rechargement raté) s'affiche à part.
  const texte = donnees.avertissement || (donnees.statut === "ok" ? "" : donnees.message);
  const message = $("message-camera");
  message.hidden = texte === "";
  message.textContent = texte;

  const personne = donnees.personne;
  const afficherFiche = personne !== null && !etat.masquee;
  $("fiche").hidden = !afficherFiche;
  $("accueil").hidden = personne !== null || etat.masquee;
  $("masquee").hidden = !etat.masquee;

  if (afficherFiche) remplirFiche(personne);
}

function basculerFiche() {
  etat.masquee = !etat.masquee;
  $("bascule").textContent = etat.masquee ? "Afficher la fiche" : "Masquer la fiche";
  if (etat.derniere) rendre(etat.derniere);
}

function demarrer() {
  $("bascule").addEventListener("click", basculerFiche);

  const flux = new EventSource("/evenements");
  flux.onmessage = (evenement) => {
    etat.derniere = JSON.parse(evenement.data);
    rendre(etat.derniere);
  };
  flux.onerror = () => {
    $("statut").textContent = "Connexion perdue, nouvelle tentative...";
  };
}

demarrer();
