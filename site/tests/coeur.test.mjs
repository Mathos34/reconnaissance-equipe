// Tests de la logique métier (pur JavaScript, sans navigateur ni modèle).
// Mêmes scénarios que les tests Python de tests/ à la racine du dépôt, plus les cas propres à la version web.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ABSENCE_MAX } from "../js/config.js";
import { Base, StockageMemoire } from "../js/coeur/base.js";
import { Lisseur } from "../js/coeur/lissage.js";
import { Suiveur } from "../js/coeur/suivi.js";

import { Galerie, moyenneNormalisee, normaliser, similarite } from "../js/coeur/gabarit.js";
import { GABARIT_ARCFACE, alignerVisage, iou, similitudeVers } from "../js/coeur/geometrie.js";
import { evaluerImage, Enrolement, indicePose, POSES } from "../js/coeur/enrolement.js";
import { erreursFiche, identifiantSuivant, initiales, validerFiche } from "../js/coeur/fiche.js";
import { Pipeline } from "../js/coeur/pipeline.js";
import { entreeDetection, redimensionner } from "../js/coeur/image.js";
import { calculerLetterbox, decoderScrfd, nms, STRIDES } from "../js/coeur/scrfd.js";
import { dateDepuisIso, derniereVisite, formaterDate, suggerer } from "../js/coeur/suggestion.js";

// ---------- utilitaires de test ----------
function vecteur(graine, dimension = 512) {
  // Générateur pseudo-aléatoire déterministe (mulberry32) : même vecteur à chaque exécution.
  let s = graine >>> 0;
  const suivant = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const v = Float32Array.from({ length: dimension }, () => suivant() * 2 - 1);
  return normaliser(v);
}

const boite = (x1, y1, x2, y2) => [x1, y1, x2, y2];
const visage = (embedding, score = 0.9, b = boite(100, 100, 300, 320)) => ({
  boite: b,
  score,
  embedding,
  kps: GABARIT_ARCFACE.map(([x, y]) => [x * 2 + 100, y * 2 + 100]),
});
const BOITE_STD = boite(100, 100, 300, 320);

const FICHE_CLAIRE = {
  identifiant: "C001",
  civilite: "Madame",
  prenom: "Claire",
  nom: "Test",
  conseiller: "Camille Conseil",
  preferences: { boisson: "café glacé", temperature: "froid", sucre: "non", lait: "lait d'amande" },
  taille_vetement: "38",
  styles: ["minimaliste"],
  cadeaux_notes: [],
  derniers_achats: [
    { date: "2026-09-14", article: "Sac cuir tilleul", montant: 1240 },
    { date: "2026-07-02", article: "Carnet cuir", montant: 85 },
  ],
  notes: "Aime être accueillie rapidement.",
  prochain_rendez_vous: "2026-10-20T10:30:00",
};

// ---------- géométrie ----------
test("iou : boîtes identiques, disjointes, partiellement recouvertes", () => {
  assert.equal(iou(boite(0, 0, 100, 100), boite(0, 0, 100, 100)), 1);
  assert.equal(iou(boite(0, 0, 100, 100), boite(500, 500, 600, 600)), 0);
  // intersection 50 x 100 = 5000, union 10000 + 10000 - 5000 = 15000
  assert.ok(Math.abs(iou(boite(0, 0, 100, 100), boite(50, 0, 150, 100)) - 1 / 3) < 1e-9);
});

test("similitudeVers retrouve la transformation exacte (échelle, rotation, translation)", () => {
  const echelle = 2.5;
  const angle = 0.3;
  const [tx, ty] = [17, -4];
  const source = [
    [0, 0],
    [10, 2],
    [3, 9],
    [-5, 4],
    [7, -6],
  ];
  const cible = source.map(([x, y]) => [
    echelle * (Math.cos(angle) * x - Math.sin(angle) * y) + tx,
    echelle * (Math.sin(angle) * x + Math.cos(angle) * y) + ty,
  ]);
  const [[a, mb, txe], [b, a2, tye]] = similitudeVers(source, cible);
  assert.ok(Math.abs(a - echelle * Math.cos(angle)) < 1e-6);
  assert.ok(Math.abs(b - echelle * Math.sin(angle)) < 1e-6);
  assert.ok(Math.abs(txe - tx) < 1e-6 && Math.abs(tye - ty) < 1e-6);
  assert.ok(Math.abs(mb + b) < 1e-6 && Math.abs(a2 - a) < 1e-6);
});

test("alignerVisage : des points déjà au gabarit donnent une image identique au crop", () => {
  const taille = 112;
  const data = new Uint8ClampedArray(taille * taille * 4);
  for (let i = 0; i < taille * taille; i++) {
    data[i * 4] = i % 251;
    data[i * 4 + 1] = (i * 3) % 247;
    data[i * 4 + 2] = (i * 7) % 241;
    data[i * 4 + 3] = 255;
  }
  const image = { width: taille, height: taille, data };
  const sortie = alignerVisage(image, GABARIT_ARCFACE, 112);
  for (let i = 0; i < taille * taille; i++) {
    assert.ok(Math.abs(sortie[i * 3] - data[i * 4]) <= 1, `pixel ${i} rouge`);
  }
});

// ---------- gabarits et galerie ----------
test("normaliser produit un vecteur unitaire et refuse le vecteur nul", () => {
  const v = normaliser([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
  assert.throws(() => normaliser([0, 0, 0]));
});

test("moyenneNormalisee reste unitaire et proche de la direction moyenne", () => {
  const base = vecteur(1);
  const bruits = [1, 2, 3, 4, 5].map((g) => normaliser(base.map((v, i) => v + 0.05 * vecteur(g + 10)[i])));
  const gabarit = moyenneNormalisee(bruits);
  assert.ok(Math.abs(Math.hypot(...gabarit) - 1) < 1e-5);
  assert.ok(similarite(gabarit, base) > 0.98);
});

test("Galerie : reconnaissance au-dessus du seuil, inconnu en dessous, galerie vide", () => {
  const galerie = new Galerie([
    { identifiant: "C001", gabarit: vecteur(1) },
    { identifiant: "C002", gabarit: vecteur(2) },
  ]);
  const haut = galerie.reconnaitre(vecteur(2), 0.35);
  assert.equal(haut.identifiant, "C002");
  assert.ok(haut.score > 0.99);
  const inconnu = galerie.reconnaitre(vecteur(99), 0.35);
  assert.equal(inconnu.identifiant, null);
  assert.ok(Math.abs(inconnu.score) < 0.35);
  assert.deepEqual(new Galerie().reconnaitre(vecteur(1), 0.35), { identifiant: null, score: 0 });
});

test("Galerie : supprimer renvoie si le gabarit existait", () => {
  const galerie = new Galerie([{ identifiant: "C001", gabarit: vecteur(1) }]);
  assert.equal(galerie.supprimer("C001"), true);
  assert.equal(galerie.supprimer("C001"), false);
  assert.equal(galerie.contient("C001"), false);
});

// ---------- suivi et lissage (mêmes scénarios que tests/test_tracker.py et test_decision.py) ----------
test("Suiveur : un visage garde son identifiant entre deux détections", () => {
  const suiveur = new Suiveur();
  const [{ piste: p1 }] = suiveur.mettreAJour([boite(0, 0, 100, 100)]);
  const [{ piste: p2 }] = suiveur.mettreAJour([boite(10, 5, 110, 105)]);
  assert.equal(p1.identifiant, p2.identifiant);
  assert.deepEqual(p2.boite, [10, 5, 110, 105]);
});

test("Suiveur : une piste ne peut correspondre qu'à une seule boîte", () => {
  const suiveur = new Suiveur();
  suiveur.mettreAJour([boite(0, 0, 100, 100)]);
  const associations = suiveur.mettreAJour([boite(0, 0, 100, 100), boite(10, 5, 110, 105)]);
  assert.equal(suiveur.pistes().length, 2);
  assert.notEqual(associations[0].piste.identifiant, associations[1].piste.identifiant);
});

test("Suiveur : une piste absente trop longtemps est oubliée", () => {
  const suiveur = new Suiveur({ absenceMax: 2 });
  suiveur.mettreAJour([boite(0, 0, 100, 100)]);
  suiveur.mettreAJour([]);
  suiveur.mettreAJour([]);
  assert.equal(suiveur.pistes().length, 1);
  suiveur.mettreAJour([]);
  assert.equal(suiveur.pistes().length, 0);
});

test("Lisseur : il faut 3 décisions concordantes sur 5", () => {
  const lisseur = new Lisseur({ fenetre: 5, votesMin: 3 });
  assert.equal(lisseur.ajouter(1, "C001"), null);
  assert.equal(lisseur.ajouter(1, "C001"), null);
  assert.equal(lisseur.ajouter(1, "C001"), "C001");
});

test("Lisseur : les décisions inconnues (null) ne comptent pour personne", () => {
  const lisseur = new Lisseur();
  for (const id of ["C001", null, null, "C001"]) lisseur.ajouter(1, id);
  assert.equal(lisseur.affiche(1), null);
  assert.equal(lisseur.ajouter(1, "C001"), "C001");
});

test("Lisseur : la fenêtre glisse, oublier efface la piste", () => {
  const lisseur = new Lisseur();
  for (let i = 0; i < 3; i++) lisseur.ajouter(1, "C001");
  for (let i = 0; i < 5; i++) lisseur.ajouter(1, "C002");
  assert.equal(lisseur.affiche(1), "C002");
  lisseur.oublier(1);
  assert.equal(lisseur.affiche(1), null);
  assert.throws(() => new Lisseur({ fenetre: 2, votesMin: 3 }));
});

// ---------- pipeline ----------
class DetecteurFictif {
  constructor(visages) {
    this.visages = visages;
    this.appels = 0;
  }
  async detecter() {
    this.appels += 1;
    return this.visages.map((v) => ({ ...v }));
  }
}

test("Pipeline : détection une image sur K, identité stable entre deux détections", async () => {
  const galerie = new Galerie([{ identifiant: "C001", gabarit: vecteur(1) }]);
  const detecteur = new DetecteurFictif([{ boite: BOITE_STD, score: 0.9, embedding: vecteur(1) }]);
  const pipeline = new Pipeline({ galerie, k: 3 });
  let dernier = [];
  for (let i = 0; i < 9; i++) dernier = await pipeline.traiterImage(() => detecteur.detecter());
  assert.equal(detecteur.appels, 3);
  assert.equal(dernier[0].identifiant, "C001");
});

test("Pipeline : un visage inconnu reste inconnu et la galerie n'est pas modifiée", async () => {
  const galerie = new Galerie([{ identifiant: "C001", gabarit: vecteur(1) }]);
  const detecteur = new DetecteurFictif([{ boite: BOITE_STD, score: 0.9, embedding: vecteur(99) }]);
  const pipeline = new Pipeline({ galerie, k: 1 });
  let dernier = [];
  for (let i = 0; i < 5; i++) dernier = await pipeline.traiterImage(() => detecteur.detecter());
  assert.equal(dernier[0].identifiant, null);
  assert.deepEqual(galerie.identifiants(), ["C001"]);
});

test("Pipeline : une piste disparue est oubliée du lissage", async () => {
  const lisseur = new Lisseur();
  const detecteur = new DetecteurFictif([{ boite: BOITE_STD, score: 0.9, embedding: vecteur(1) }]);
  const pipeline = new Pipeline({ galerie: new Galerie([{ identifiant: "C001", gabarit: vecteur(1) }]), k: 1, lisseur });
  for (let i = 0; i < 3; i++) await pipeline.traiterImage(() => detecteur.detecter());
  assert.deepEqual(lisseur.pistesSuivies(), [1]);
  detecteur.visages = [];
  for (let i = 0; i <= ABSENCE_MAX + 1; i++) await pipeline.traiterImage(() => detecteur.detecter());
  assert.deepEqual(lisseur.pistesSuivies(), []);
});

// ---------- enrôlement ----------
test("evaluerImage : un seul visage, score >= 0,6, largeur >= 120 px", () => {
  assert.equal(evaluerImage([]).visage, null);
  assert.equal(evaluerImage([visage(vecteur(1)), visage(vecteur(2))]).visage, null);
  assert.equal(evaluerImage([visage(vecteur(1), 0.59)]).visage, null);
  assert.ok(evaluerImage([visage(vecteur(1), 0.6)]).visage);
  assert.equal(evaluerImage([visage(vecteur(1), 0.9, boite(0, 0, 119, 200))]).visage, null);
  assert.ok(evaluerImage([visage(vecteur(1), 0.9, boite(0, 0, 120, 200))]).visage);
});

test("Enrolement : 25 images en 5 poses, puis gabarit", () => {
  assert.equal(indicePose(0), 0);
  assert.equal(indicePose(4), 0);
  assert.equal(indicePose(5), 1);
  assert.equal(indicePose(24), 4);
  assert.equal(POSES.length, 5);
  const enrolement = new Enrolement();
  assert.equal(enrolement.consigne(), POSES[0].consigne);
  for (let i = 0; i < 25; i++) enrolement.ajouter(vecteur(i + 1));
  assert.equal(enrolement.termine, true);
  assert.equal(enrolement.ajouter(vecteur(99)), false);
  assert.ok(Math.abs(Math.hypot(...enrolement.gabarit()) - 1) < 1e-5);
  assert.throws(() => new Enrolement().gabarit());
});

// ---------- fiches ----------
test("erreursFiche : une fiche de démo est valide, les erreurs courantes sont signalées", () => {
  assert.deepEqual(erreursFiche(FICHE_CLAIRE), []);
  assert.ok(erreursFiche({ ...FICHE_CLAIRE, prenom: "" }).some((e) => e.champ === "prenom"));
  assert.ok(erreursFiche({ ...FICHE_CLAIRE, preferences: { ...FICHE_CLAIRE.preferences, temperature: "tiède" } }).some((e) => e.champ === "temperature"));
  assert.ok(erreursFiche({ ...FICHE_CLAIRE, preferences: { ...FICHE_CLAIRE.preferences, sucre: -1 } }).some((e) => e.champ === "sucre"));
  assert.ok(erreursFiche({ ...FICHE_CLAIRE, identifiant: "C 01" }).some((e) => e.champ === "identifiant"));
  assert.ok(erreursFiche({ ...FICHE_CLAIRE, derniers_achats: [{ date: "14/09/2026", article: "x", montant: 1 }] }).length > 0);
  assert.throws(() => validerFiche({ ...FICHE_CLAIRE, nom: " " }));
});

test("sucre 0 est accepté (sans sucre) comme 'non'", () => {
  const fiche = { ...FICHE_CLAIRE, preferences: { ...FICHE_CLAIRE.preferences, sucre: 0 } };
  assert.deepEqual(erreursFiche(fiche), []);
  assert.equal(suggerer(fiche, new Date(2026, 9, 8, 9, 0)).sucre, "sans sucre");
});

test("identifiantSuivant et initiales", () => {
  assert.equal(identifiantSuivant([]), "C001");
  assert.equal(identifiantSuivant(["C001", "C009", "X"]), "C010");
  assert.equal(initiales(FICHE_CLAIRE), "CT");
});

// ---------- suggestion (mêmes phrases que tests/test_suggest.py) ----------
test("suggestion : avant 12 h, la phrase d'accueil sans rappel de visite", () => {
  const s = suggerer(FICHE_CLAIRE, new Date(2026, 9, 8, 9, 15));
  assert.equal(s.accroche, "Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ?");
  assert.equal(s.moment, "matin");
  assert.ok(!s.accroche.includes("Dernière visite"));
});

test("suggestion : à partir de 12 h, rappel de la dernière visite ; bascule exacte à 12 h 00", () => {
  const apres = suggerer(FICHE_CLAIRE, new Date(2026, 9, 8, 15, 0));
  assert.equal(apres.moment, "apres_midi");
  assert.ok(apres.accroche.endsWith("Dernière visite le 14/09/2026."));
  assert.equal(suggerer(FICHE_CLAIRE, new Date(2026, 9, 8, 12, 0)).moment, "apres_midi");
  assert.equal(suggerer(FICHE_CLAIRE, new Date(2026, 9, 8, 11, 59)).moment, "matin");
});

test("suggestion : sucre et lait toujours affichés, sans achat pas de rappel", () => {
  const avecDeuxSucres = { ...FICHE_CLAIRE, preferences: { ...FICHE_CLAIRE.preferences, sucre: 2, lait: "lait d'avoine" } };
  for (const heure of [9, 15]) {
    const s = suggerer(avecDeuxSucres, new Date(2026, 9, 8, heure, 0));
    assert.equal(s.sucre, "avec 2 morceaux de sucre");
    assert.equal(s.lait, "lait d'avoine");
  }
  const sansAchat = { ...FICHE_CLAIRE, derniers_achats: [] };
  const s = suggerer(sansAchat, new Date(2026, 9, 8, 16, 0));
  assert.equal(s.derniere_visite, null);
  assert.ok(!s.accroche.includes("Dernière visite"));
});

test("derniereVisite prend la date la plus récente, même si la liste n'est pas triée", () => {
  const desordre = {
    ...FICHE_CLAIRE,
    derniers_achats: [
      { date: "2026-06-18", article: "Eau", montant: 165 },
      { date: "2026-09-30", article: "Écharpe", montant: 420 },
      { date: "2026-07-02", article: "Carnet", montant: 85 },
    ],
  };
  assert.equal(formaterDate(derniereVisite(desordre)), "30/09/2026");
  assert.equal(formaterDate(dateDepuisIso("2026-02-01")), "01/02/2026");
});

// ---------- image et décodage SCRFD ----------
test("calculerLetterbox : 1280 x 720 devient 640 x 360 à l'échelle 0,5", () => {
  const l = calculerLetterbox(1280, 720, 640);
  assert.deepEqual([l.largeur, l.hauteur, l.echelle], [640, 360, 0.5]);
  const portrait = calculerLetterbox(720, 1280, 640);
  assert.deepEqual([portrait.largeur, portrait.hauteur], [360, 640]);
});

test("entreeDetection : le remplissage noir vaut (0 - 127,5) / 128", () => {
  // Image 4 x 2 : réduite à 8 x 4, les lignes 4 à 7 du carré 8 x 8 restent noires.
  const image = { width: 4, height: 2, data: new Uint8ClampedArray(32).fill(255) };
  const { entree } = entreeDetection(image, 8);
  const noir = (0 - 127.5) / 128;
  assert.ok(Math.abs(entree[7 * 8 + 7] - noir) < 1e-6, "coin bas-droit = remplissage");
  assert.ok(Math.abs(entree[0] - (255 - 127.5) / 128) < 1e-6, "coin haut-gauche = image");
});

test("redimensionner : une image uniforme reste uniforme", () => {
  const image = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(90) };
  const petite = redimensionner(image, 2, 2);
  assert.equal(petite.width, 2);
  assert.ok(petite.data.every((v) => v === 90));
});

// Ordre des sorties SCRFD : tous les scores (3 niveaux), puis toutes les boîtes, puis tous les points.
function sortiesVides() {
  const scores = [];
  const boites = [];
  const points = [];
  for (const stride of STRIDES) {
    const n = (640 / stride) ** 2 * 2;
    scores.push(new Float32Array(n));
    boites.push(new Float32Array(n * 4));
    points.push(new Float32Array(n * 10));
  }
  return [...scores, ...boites, ...points];
}

test("decoderScrfd : un seul ancrage fort donne une boîte et 5 points au bon endroit", () => {
  const sorties = sortiesVides();
  // Niveau stride 8 : cellule (ligne 10, colonne 10), ancre 0 → centre (80, 80).
  const loc = 10 * 80 + 10;
  const idx = loc * 2;
  sorties[0][idx] = 0.9;
  sorties[3].set([2, 2, 2, 2], idx * 4); // distances en unités de stride : 16 px de chaque côté
  const trouves = decoderScrfd(sorties, { taille: 640, echelle: 1, seuil: 0.5, seuilNms: 0.4 });
  assert.equal(trouves.length, 1);
  assert.deepEqual(trouves[0].boite, [64, 64, 96, 96]);
  assert.equal(trouves[0].kps.length, 5);
  assert.deepEqual(trouves[0].kps[0], [80, 80]);
});

test("decoderScrfd : seuil de score respecté et mise à l'échelle appliquée", () => {
  const idx = (10 * 80 + 10) * 2; // même cellule que le test précédent, centre (80, 80)
  const sorties = sortiesVides();
  sorties[0][idx] = 0.3; // sous le seuil
  sorties[3].set([2, 2, 2, 2], idx * 4);
  assert.equal(decoderScrfd(sorties, { taille: 640, echelle: 0.5, seuil: 0.5, seuilNms: 0.4 }).length, 0);

  sorties[0][idx] = 0.8;
  const [haut] = decoderScrfd(sorties, { taille: 640, echelle: 0.5, seuil: 0.5, seuilNms: 0.4 });
  // Boîte (64, 64, 96, 96) dans l'espace du modèle, ramenée à l'image d'origine : divisée par 0,5.
  assert.deepEqual(haut.boite, [128, 128, 192, 192]);
  assert.deepEqual(haut.kps[0], [160, 160]);
});

test("nms : garde le meilleur de deux boîtes très recouvrantes", () => {
  const garde = nms(
    [
      { boite: [0, 0, 100, 100], score: 0.9, kps: [] },
      { boite: [5, 5, 105, 105], score: 0.8, kps: [] },
      { boite: [300, 300, 400, 400], score: 0.7, kps: [] },
    ],
    0.4,
  );
  assert.equal(garde.length, 2);
  assert.equal(garde[0].score, 0.9);
});

// ---------- base des clients ----------
test("Base : enregistrer, lister, obtenir, galerie et suppression", () => {
  const base = new Base(new StockageMemoire(), "test");
  base.enregistrer(FICHE_CLAIRE, { gabarit: vecteur(1), consentement: { date: "2026-10-08T09:30:00", mention: "J'ACCEPTE" } });
  base.enregistrer({ ...FICHE_CLAIRE, identifiant: "C002", prenom: "Antoine", nom: "Démo" });

  const liste = base.lister();
  assert.deepEqual(
    liste.map((c) => c.identifiant),
    ["C002", "C001"], // trié par nom : Démo avant Test
  );
  assert.equal(base.obtenir("C001").aGabarit, true);
  assert.equal(base.obtenir("C002").aGabarit, false);
  assert.equal(base.entreesGalerie().length, 1);
  assert.equal(base.entreesGalerie()[0].identifiant, "C001");
  assert.equal(base.entreesGalerie()[0].gabarit.length, 512);

  // Modifier la fiche sans recapturer conserve le gabarit et le consentement.
  base.enregistrer({ ...FICHE_CLAIRE, notes: "Nouvelle note" });
  assert.equal(base.obtenir("C001").aGabarit, true);
  assert.equal(base.obtenir("C001").consentement.mention, "J'ACCEPTE");

  assert.equal(base.retirerBiometrie("C001"), true);
  assert.equal(base.obtenir("C001").aGabarit, false);
  assert.ok(base.obtenir("C001"), "la fiche reste");
  assert.equal(base.supprimer("C001"), true);
  assert.equal(base.obtenir("C001"), null);
});

test("Base : export puis import restaurent les données, un fichier invalide ne modifie rien", () => {
  const source = new Base(new StockageMemoire(), "test");
  source.enregistrer(FICHE_CLAIRE, { gabarit: vecteur(1) });
  const sauvegarde = source.exporter();

  const cible = new Base(new StockageMemoire(), "test2");
  const resultat = cible.importer(sauvegarde);
  assert.equal(resultat.ajoutes, 1);
  assert.equal(cible.entreesGalerie()[0].identifiant, "C001");
  assert.ok(Math.abs(similarite(cible.entreesGalerie()[0].gabarit, vecteur(1)) - 1) < 1e-5);

  const avant = JSON.stringify(JSON.parse(cible.exporter()).clients);
  assert.throws(() => cible.importer("{ pas du json"));
  assert.throws(() => cible.importer(JSON.stringify({ format: "autre", version: 1, clients: [] })));
  const corrompu = JSON.parse(sauvegarde);
  corrompu.clients[0].fiche.prenom = "";
  assert.throws(() => cible.importer(JSON.stringify(corrompu)), /prénom/);
  // Aucun des imports refusés n'a modifié la base.
  assert.equal(JSON.stringify(JSON.parse(cible.exporter()).clients), avant);
});

test("Base : mode remplacer vide la base avant l'import", () => {
  const base = new Base(new StockageMemoire(), "test3");
  base.enregistrer({ ...FICHE_CLAIRE, identifiant: "C009" });
  const source = new Base(new StockageMemoire(), "src");
  source.enregistrer(FICHE_CLAIRE);
  base.importer(source.exporter(), { mode: "remplacer" });
  assert.deepEqual(base.identifiants(), ["C001"]);
});
