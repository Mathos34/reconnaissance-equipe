// Suggestion d'accueil selon les préférences et l'heure. Même règle que src/boutique/suggest.py.
// - avant 12 h : la boisson préférée, dans la température enregistrée ;
// - à partir de 12 h : la boisson, plus un rappel de la dernière visite ;
// - dans tous les cas : sucre et lait affichés pour que le conseiller les confirme.

export const HEURE_BASCULE = 12;

/** "2026-09-14" -> Date locale à minuit. */
export function dateDepuisIso(texte) {
  const [annee, mois, jour] = texte.split("-").map(Number);
  return new Date(annee, mois - 1, jour);
}

/** Date au format français, JJ/MM/AAAA. */
export function formaterDate(date) {
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${jour}/${mois}/${date.getFullYear()}`;
}

/** Date du dernier achat enregistré, qui sert de dernière visite. null si aucun achat. */
export function derniereVisite(fiche) {
  const dates = (fiche.derniers_achats || []).map((achat) => dateDepuisIso(achat.date));
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

function libelleSucre(sucre) {
  if (sucre === "non" || sucre === 0) return "sans sucre";
  if (sucre === 1) return "avec 1 morceau de sucre";
  return `avec ${sucre} morceaux de sucre`;
}

export function suggerer(fiche, maintenant = new Date()) {
  const preferences = fiche.preferences;
  const article = preferences.article || "un";
  const boisson = `${article} ${preferences.boisson}`;
  let accroche = `Bonjour ${fiche.civilite} ${fiche.nom}, ${boisson} ${libelleSucre(preferences.sucre)}, comme d'habitude ?`;

  const apresMidi = maintenant.getHours() >= HEURE_BASCULE;
  const visite = derniereVisite(fiche);
  if (apresMidi && visite !== null) {
    accroche += ` Dernière visite le ${formaterDate(visite)}.`;
  }

  return {
    accroche,
    boisson,
    temperature: preferences.temperature === "chaud" ? "chaude" : "froide",
    sucre: libelleSucre(preferences.sucre),
    lait: preferences.lait,
    moment: apresMidi ? "apres_midi" : "matin",
    derniere_visite: visite !== null ? formaterDate(visite) : null,
  };
}
