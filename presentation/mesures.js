// Mesures du projet, lues dans evaluation/resultats/, communes aux présentations française et anglaise.

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const lire = (fichier) => JSON.parse(fs.readFileSync(path.join(RACINE, "evaluation/resultats", fichier), "utf8"));

const URL_DEMO = "https://mathos34.github.io/reconnaissance-equipe/";
const URL_DEPOT = "https://github.com/Mathos34/reconnaissance-equipe";

const nav = lire("navigateur.json");
const rob = lire("robustesse.json");

const mediane = (valeurs) => {
  const v = valeurs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function moteur(nom, source = nav) {
  const s = source?.moteurs?.[nom]?.sessions ?? [];
  if (!s.length) return null;
  return {
    sessions: s.length,
    pre: mediane(s.map((x) => x.latenceMs.pretraitement.p50)),
    det: mediane(s.map((x) => x.latenceMs.inference.p50)),
    emb: mediane(s.map((x) => x.latenceMs.embedding.p50)),
    tot: mediane(s.map((x) => x.latenceMs.totale.p50)),
    p95: mediane(s.map((x) => x.latenceMs.totale.p95)),
    fps: mediane(s.map((x) => x.fpsMoyen)),
    analyses: mediane(s.map((x) => x.analysesParSeconde)),
    delai: mediane(s.map((x) => x.delaiReconnaissanceMs.p50)),
    chargement: mediane(s.map((x) => x.chargementMs)),
  };
}

// La clé « auto » désigne les sessions mesurées avant le paramètre ?moteur= (fournisseur hybride, D-037).
const M = { wasm: moteur("wasm"), webgpu: moteur("webgpu"), hybride: moteur("hybride") ?? moteur("auto") };
// Mesures avec le GPU dédié (RTX 3060) activé pour le navigateur, si elles existent.
const fichierGpu = path.join(RACINE, "evaluation/resultats/navigateur_gpu_dedie.json");
const navGpu = fs.existsSync(fichierGpu) ? JSON.parse(fs.readFileSync(fichierGpu, "utf8")) : null;
const MG = navGpu ? { webgpu: moteur("webgpu", navGpu), hybride: moteur("hybride", navGpu) ?? moteur("auto", navGpu) } : {};
const defaut = M.wasm; // moteur par défaut du site (docs/DECISIONS.md, D-037)
// Réglage du PC de démo : hybride sur GPU dédié s'il a été mesuré plus rapide, sinon le défaut.
const demoHybride = Boolean(MG.hybride && MG.hybride.tot < defaut.tot);
const demo = demoHybride ? MG.hybride : defaut;
const enrolement = nav.enrolements[nav.enrolements.length - 1];

const taille = rob.conditions.taille.niveaux;
const distanceFiable = Math.max(...taille.filter((n) => n.identification === 100).map((n) => n.distanceEstimeeM));
const distanceUtile = Math.max(...taille.filter((n) => n.identification >= 80).map((n) => n.distanceEstimeeM));
const tauxUtile = taille.find((n) => n.distanceEstimeeM === distanceUtile).identification;
// Si chaque visage détecté a été bien identifié, la distance utile est limitée par la détection.
const limiteParDetection = taille.every((n) => n.detection === n.identification);
const auSeuil = rob.auSeuil;

const PARITE = { ecartPx: 0.17, cosinus: 0.9985 }; // site/tests/parite.test.mjs (6 visages sur 6)
const TESTS = { js: 45, python: 88, e2e: 1 };
const POIDS_MO = 15.4;

module.exports = {
  URL_DEMO, URL_DEPOT, nav, rob, mediane, M, MG, defaut, demo, demoHybride, enrolement,
  taille, distanceFiable, distanceUtile, tauxUtile, limiteParDetection, auSeuil, PARITE, TESTS, POIDS_MO,
};
