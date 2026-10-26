// Indicateurs (KPI) de la démo : performance, qualité de reconnaissance, enrôlement et données métier.
// Pur JavaScript : les pages fournissent les instants (performance.now()) et les résultats,
// ce module calcule. Testé par tests/indicateurs.test.mjs.

export const CLE_JOURNAL = "maison-test/indicateurs/v1";
export const TAILLE_JOURNAL = 100;
export const PAS_HISTOGRAMME = 0.05;
// Mémoire bornée : au-delà, seules les mesures les plus récentes sont gardées pour les percentiles.
export const ECHANTILLON_MAX = 5000;

/** Ajoute une valeur en gardant au plus `max` valeurs récentes (coût amorti constant). */
function pousser(tableau, valeur, max = ECHANTILLON_MAX) {
  tableau.push(valeur);
  if (tableau.length > 2 * max) tableau.splice(0, tableau.length - max);
}

// ---------- statistiques ----------

export function moyenne(valeurs) {
  return valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null;
}

/** Percentile par interpolation linéaire (p entre 0 et 100). null pour une liste vide. */
export function percentile(valeurs, p) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const rang = (p / 100) * (tri.length - 1);
  const bas = Math.floor(rang);
  const haut = Math.ceil(rang);
  return tri[bas] + (tri[haut] - tri[bas]) * (rang - bas);
}

/** Résumé d'une série : effectif, moyenne, médiane, 95e percentile, minimum, maximum. */
export function resumer(valeurs) {
  return {
    n: valeurs.length,
    moyenne: moyenne(valeurs),
    p50: percentile(valeurs, 50),
    p95: percentile(valeurs, 95),
    min: valeurs.length ? Math.min(...valeurs) : null,
    max: valeurs.length ? Math.max(...valeurs) : null,
  };
}

/** Histogramme à pas fixe. Les valeurs hors bornes sont rangées dans la première ou la dernière classe. */
export function histogramme(valeurs, { min = -0.2, max = 1, pas = PAS_HISTOGRAMME } = {}) {
  const nombre = Math.round((max - min) / pas);
  const classes = Array.from({ length: nombre }, (_, i) => ({
    debut: +(min + i * pas).toFixed(4),
    fin: +(min + (i + 1) * pas).toFixed(4),
    n: 0,
  }));
  for (const v of valeurs) {
    const i = Math.min(nombre - 1, Math.max(0, Math.floor((v - min) / pas)));
    classes[i].n += 1;
  }
  return classes;
}

/** Additionne deux histogrammes de mêmes classes. */
export function additionnerHistogrammes(a, b) {
  if (!a?.length) return b ? b.map((c) => ({ ...c })) : [];
  if (!b?.length) return a.map((c) => ({ ...c }));
  return a.map((c, i) => ({ ...c, n: c.n + (b[i]?.n ?? 0) }));
}

const arrondir = (v, decimales = 1) => (v === null || v === undefined ? null : +v.toFixed(decimales));
const resumerArrondi = (valeurs, decimales = 1) => {
  const r = resumer(valeurs);
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "n" ? v : arrondir(v, decimales)]));
};

// ---------- reconnaissance en direct ----------

/**
 * Mesures d'une session de reconnaissance. La page appelle :
 * - image(instant) à chaque image affichée,
 * - detection({...}) après chaque détection, avec les durées de chaque étape,
 * - decisions(resultats) avec les meilleurs scores bruts de la détection,
 * - observer(affichages, instant) après chaque image, pour le délai jusqu'à reconnaissance.
 */
export class MesuresReconnaissance {
  constructor({ fournisseur = "inconnu", chargementMs = null, debut = 0, seuil = null } = {}) {
    this.fournisseur = fournisseur;
    this.chargementMs = chargementMs;
    this.seuil = seuil;
    this._debut = debut;
    this._dernierInstant = debut;
    this._nombreImages = 0;
    this._instants = []; // 60 derniers instants, pour le fps récent
    this._intervalles = [];
    this._pretraitement = [];
    this._inference = [];
    this._embedding = [];
    this._totale = [];
    this._visagesMax = 0;
    this._nombreDetections = 0;
    this._instantsAnalyse = [];
    this._scores = [];
    this._premiereVue = new Map();
    this._reconnues = new Set();
    this._identites = new Set();
    this._delais = [];
  }

  image(instant) {
    if (this._instants.length) pousser(this._intervalles, instant - this._instants[this._instants.length - 1]);
    pousser(this._instants, instant, 60);
    this._nombreImages += 1;
    this._dernierInstant = instant;
  }

  detection({ pretraitementMs = 0, inferenceMs = 0, embeddingMs = 0, visages = 0, instant = null }) {
    pousser(this._pretraitement, pretraitementMs);
    pousser(this._inference, inferenceMs);
    pousser(this._embedding, embeddingMs);
    pousser(this._totale, pretraitementMs + inferenceMs + embeddingMs);
    if (instant !== null) pousser(this._instantsAnalyse, instant, 60);
    this._nombreDetections += 1;
    this._visagesMax = Math.max(this._visagesMax, visages);
  }

  /** Meilleurs scores bruts de la dernière détection : [{score}], avant lissage. */
  decisions(resultats) {
    for (const r of resultats) pousser(this._scores, r.score);
  }

  /** Suit chaque piste : instant d'apparition, puis instant de la première identité affichée. */
  observer(affichages, instant) {
    for (const a of affichages) {
      if (!this._premiereVue.has(a.piste)) this._premiereVue.set(a.piste, instant);
      if (a.identifiant !== null && !this._reconnues.has(a.piste)) {
        this._reconnues.add(a.piste);
        this._identites.add(a.identifiant);
        this._delais.push(instant - this._premiereVue.get(a.piste));
      }
    }
  }

  /** fps instantané sur les 30 dernières images. */
  fpsRecent() {
    const recents = this._instants.slice(-30);
    if (recents.length < 2) return 0;
    return ((recents.length - 1) * 1000) / (recents[recents.length - 1] - recents[0]);
  }

  /** Analyses (détection et reconnaissance) par seconde, sur les 30 dernières : la vraie cadence de mise à jour. */
  analysesRecentes() {
    const recents = this._instantsAnalyse.slice(-30);
    if (recents.length < 2) return 0;
    return ((recents.length - 1) * 1000) / (recents[recents.length - 1] - recents[0]);
  }

  /** Dernière latence totale de détection, en ms. */
  derniereLatence() {
    return this._totale.length ? this._totale[this._totale.length - 1] : null;
  }

  dernierDelai() {
    return this._delais.length ? this._delais[this._delais.length - 1] : null;
  }

  resume(fin = this._dernierInstant, date = new Date()) {
    const dureeS = Math.max(0, (fin - this._debut) / 1000);
    const intervalleMedian = percentile(this._intervalles, 50);
    return {
      type: "reconnaissance",
      date: date.toISOString(),
      fournisseur: this.fournisseur,
      chargementMs: arrondir(this.chargementMs, 0),
      seuil: this.seuil,
      dureeS: arrondir(dureeS, 1),
      images: this._nombreImages,
      fpsMoyen: dureeS > 0 ? arrondir(this._nombreImages / dureeS, 1) : null,
      fpsMedian: intervalleMedian ? arrondir(1000 / intervalleMedian, 1) : null,
      detections: this._nombreDetections,
      analysesParSeconde: dureeS > 0 ? arrondir(this._nombreDetections / dureeS, 1) : null,
      latenceMs: {
        pretraitement: resumerArrondi(this._pretraitement),
        inference: resumerArrondi(this._inference),
        embedding: resumerArrondi(this._embedding),
        totale: resumerArrondi(this._totale),
      },
      visagesMax: this._visagesMax,
      pistesVues: this._premiereVue.size,
      pistesReconnues: this._reconnues.size,
      identitesReconnues: this._identites.size,
      delaiReconnaissanceMs: resumerArrondi(this._delais, 0),
      scores: resumerArrondi(this._scores, 3),
      histogrammeScores: histogramme(this._scores),
    };
  }
}

// ---------- enrôlement ----------

export const RAISON_ESPACEE = "Image valide, ignorée pour varier les poses";

export class MesuresEnrolement {
  constructor({ source = "camera", debut = 0 } = {}) {
    this.source = source;
    this._debut = debut;
    this._fin = null;
    this._analysees = 0;
    this._retenues = 0;
    this._refus = new Map();
  }

  /** Une image analysée. raison vaut null si l'image est retenue. */
  analyse(raison) {
    this._analysees += 1;
    if (raison === null) this._retenues += 1;
    else this._refus.set(raison, (this._refus.get(raison) || 0) + 1);
  }

  terminer(instant) {
    this._fin = instant;
  }

  resume(date = new Date()) {
    const espacees = this._refus.get(RAISON_ESPACEE) || 0;
    const valides = this._retenues + espacees;
    const dureeS = this._fin === null ? null : (this._fin - this._debut) / 1000;
    return {
      type: "enrolement",
      date: date.toISOString(),
      source: this.source,
      dureeS: arrondir(dureeS, 1),
      imagesAnalysees: this._analysees,
      imagesValides: valides,
      imagesRetenues: this._retenues,
      tauxValides: this._analysees ? arrondir((100 * valides) / this._analysees, 1) : null,
      refus: Object.fromEntries(this._refus),
    };
  }
}

// ---------- journal persistant ----------

export class JournalIndicateurs {
  constructor(stockage, cle = CLE_JOURNAL) {
    this._stockage = stockage;
    this._cle = cle;
  }

  lister(type = null) {
    let entrees = [];
    try {
      entrees = JSON.parse(this._stockage.getItem(this._cle) || "[]");
    } catch {
      entrees = [];
    }
    return type ? entrees.filter((e) => e.type === type) : entrees;
  }

  ajouter(resume) {
    const entrees = this.lister();
    entrees.push(resume);
    this._stockage.setItem(this._cle, JSON.stringify(entrees.slice(-TAILLE_JOURNAL)));
  }

  vider() {
    this._stockage.removeItem(this._cle);
  }

  exporter(maintenant = new Date()) {
    return JSON.stringify({ format: "maison-test-indicateurs", version: 1, exporteLe: maintenant.toISOString(), sessions: this.lister() }, null, 2);
  }
}

// ---------- synthèse pour le tableau de bord ----------

/**
 * Agrège le journal et la base clients en indicateurs prêts à afficher.
 * `clients` : sortie de Base.lister() ; `entrees` : sortie de JournalIndicateurs.lister().
 */
export function synthetiser(entrees, clients) {
  const sessions = entrees.filter((e) => e.type === "reconnaissance" && e.detections > 0);
  const enrolements = entrees.filter((e) => e.type === "enrolement" && e.imagesRetenues > 0);

  // fps = images affichées par seconde sur la session. L'intervalle médian n'est pas utilisé :
  // deux images sur trois sont sans analyse et très rapides, ce qui donnerait un chiffre trompeur.
  const fps = sessions.map((s) => s.fpsMoyen).filter((v) => v !== null);
  const analyses = sessions.map((s) => s.analysesParSeconde).filter((v) => v !== null && v !== undefined);
  const latences = sessions.map((s) => s.latenceMs.totale.p50).filter((v) => v !== null);
  const delais = sessions.map((s) => s.delaiReconnaissanceMs.p50).filter((v) => v !== null);
  const chargements = sessions.map((s) => s.chargementMs).filter((v) => v !== null);
  const histogrammeScores = sessions.reduce((acc, s) => additionnerHistogrammes(acc, s.histogrammeScores), []);

  const refus = {};
  for (const e of enrolements) {
    for (const [raison, n] of Object.entries(e.refus)) refus[raison] = (refus[raison] || 0) + n;
  }

  const boissons = {};
  const conseillers = {};
  const paniers = [];
  for (const c of clients) {
    const boisson = c.fiche.preferences.boisson;
    boissons[boisson] = (boissons[boisson] || 0) + 1;
    conseillers[c.fiche.conseiller] = (conseillers[c.fiche.conseiller] || 0) + 1;
    const achats = c.fiche.derniers_achats || [];
    if (achats.length) paniers.push(achats.reduce((s, a) => s + a.montant, 0) / achats.length);
  }

  return {
    clients: clients.length,
    clientsAvecVisage: clients.filter((c) => c.aGabarit).length,
    sessions: sessions.length,
    enrolements: enrolements.length,
    fpsMedian: arrondir(percentile(fps, 50), 1),
    analysesMedian: arrondir(percentile(analyses, 50), 1),
    latenceMedianeMs: arrondir(percentile(latences, 50), 0),
    delaiMedianMs: arrondir(percentile(delais, 50), 0),
    chargementMedianMs: arrondir(percentile(chargements, 50), 0),
    dureeEnrolementMedianeS: arrondir(percentile(enrolements.map((e) => e.dureeS).filter((v) => v !== null), 50), 1),
    tauxValidesMoyen: arrondir(moyenne(enrolements.map((e) => e.tauxValides).filter((v) => v !== null)), 1),
    refus,
    histogrammeScores,
    boissons,
    conseillers,
    panierMoyen: arrondir(moyenne(paniers), 0),
    historique: sessions.map((s) => ({
      date: s.date,
      fournisseur: s.fournisseur,
      fps: s.fpsMoyen,
      analyses: s.analysesParSeconde ?? null,
      latence: s.latenceMs.totale.p50,
      pretraitement: s.latenceMs.pretraitement.p50,
      inference: s.latenceMs.inference.p50,
      embedding: s.latenceMs.embedding.p50,
      delai: s.delaiReconnaissanceMs.p50,
    })),
  };
}
