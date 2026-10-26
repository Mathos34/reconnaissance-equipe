// Tests des indicateurs (KPI) : statistiques, mesures de reconnaissance et d'enrôlement, journal, synthèse.

import assert from "node:assert/strict";
import { test } from "node:test";

import { StockageMemoire } from "../js/coeur/base.js";
import {
  JournalIndicateurs,
  MesuresEnrolement,
  MesuresReconnaissance,
  RAISON_ESPACEE,
  TAILLE_JOURNAL,
  additionnerHistogrammes,
  histogramme,
  percentile,
  resumer,
  synthetiser,
} from "../js/coeur/indicateurs.js";

test("percentile interpole entre deux valeurs et gère la liste vide", () => {
  assert.equal(percentile([10, 20, 30, 40], 50), 25);
  assert.equal(percentile([10, 20, 30, 40], 0), 10);
  assert.equal(percentile([10, 20, 30, 40], 100), 40);
  assert.equal(percentile([], 50), null);
  assert.deepEqual(resumer([]), { n: 0, moyenne: null, p50: null, p95: null, min: null, max: null });
});

test("histogramme : classes de 0,05, valeurs hors bornes rangées aux extrémités", () => {
  const h = histogramme([0.36, 0.37, 0.92, -5, 5], { min: 0, max: 1, pas: 0.05 });
  assert.equal(h.length, 20);
  assert.equal(h[7].n, 2); // [0,35 ; 0,40[
  assert.equal(h[0].n, 1); // -5 ramené dans la première classe
  assert.equal(h[18].n, 1); // 0,92 dans [0,90 ; 0,95[
  assert.equal(h[19].n, 1); // 5 ramené dans la dernière classe
  const somme = additionnerHistogrammes(h, h);
  assert.equal(somme[7].n, 4);
  assert.deepEqual(additionnerHistogrammes([], h), h);
});

test("MesuresReconnaissance : fps, latence par étape, délai jusqu'à la première identité", () => {
  const m = new MesuresReconnaissance({ fournisseur: "wasm", chargementMs: 812.4, debut: 0, seuil: 0.35 });
  // 11 images à 100 ms d'intervalle : 10 fps.
  for (let t = 0; t <= 1000; t += 100) m.image(t);
  m.detection({ pretraitementMs: 8, inferenceMs: 40, embeddingMs: 12, visages: 1 });
  m.detection({ pretraitementMs: 10, inferenceMs: 44, embeddingMs: 14, visages: 2 });
  m.decisions([{ score: 0.62 }, { score: 0.12 }]);

  m.observer([{ piste: 1, identifiant: null }], 100);
  m.observer([{ piste: 1, identifiant: null }], 300);
  m.observer([{ piste: 1, identifiant: "C001" }, { piste: 2, identifiant: null }], 700);
  m.observer([{ piste: 1, identifiant: "C001" }, { piste: 2, identifiant: null }], 900);

  const r = m.resume(1000, new Date("2026-10-26T10:00:00Z"));
  assert.equal(r.type, "reconnaissance");
  assert.equal(r.fournisseur, "wasm");
  assert.equal(r.chargementMs, 812);
  assert.equal(r.images, 11);
  assert.equal(r.fpsMedian, 10);
  assert.equal(r.fpsMoyen, 11);
  assert.equal(r.detections, 2);
  assert.equal(r.latenceMs.totale.p50, 64);
  assert.equal(r.latenceMs.inference.moyenne, 42);
  assert.equal(r.visagesMax, 2);
  assert.equal(r.pistesVues, 2);
  assert.equal(r.pistesReconnues, 1);
  assert.equal(r.identitesReconnues, 1);
  assert.equal(r.delaiReconnaissanceMs.p50, 600, "piste vue à 100 ms, reconnue à 700 ms");
  assert.equal(r.scores.max, 0.62);
  assert.equal(r.histogrammeScores.reduce((s, c) => s + c.n, 0), 2);
  assert.ok(Math.abs(m.fpsRecent() - 10) < 1e-9);
  assert.equal(m.derniereLatence(), 68);
});

test("MesuresReconnaissance : une piste déjà reconnue ne compte qu'une fois", () => {
  const m = new MesuresReconnaissance();
  m.observer([{ piste: 1, identifiant: "C001" }], 0);
  m.observer([{ piste: 1, identifiant: "C001" }], 500);
  assert.deepEqual(m.resume(500).delaiReconnaissanceMs.n, 1);
});

test("MesuresEnrolement : taux d'images valides, refus par motif, durée", () => {
  const m = new MesuresEnrolement({ source: "camera", debut: 1000 });
  for (let i = 0; i < 25; i++) m.analyse(null);
  for (let i = 0; i < 15; i++) m.analyse(RAISON_ESPACEE);
  for (let i = 0; i < 10; i++) m.analyse("Aucun visage détecté");
  m.terminer(13500);
  const r = m.resume();
  assert.equal(r.imagesAnalysees, 50);
  assert.equal(r.imagesRetenues, 25);
  assert.equal(r.imagesValides, 40);
  assert.equal(r.tauxValides, 80);
  assert.equal(r.dureeS, 12.5);
  assert.deepEqual(r.refus, { [RAISON_ESPACEE]: 15, "Aucun visage détecté": 10 });
});

test("JournalIndicateurs : ajout, filtre par type, plafond, export et données corrompues", () => {
  const stockage = new StockageMemoire();
  const journal = new JournalIndicateurs(stockage, "test");
  journal.ajouter({ type: "enrolement", n: 1 });
  journal.ajouter({ type: "reconnaissance", n: 2 });
  assert.equal(journal.lister().length, 2);
  assert.equal(journal.lister("enrolement").length, 1);
  for (let i = 0; i < TAILLE_JOURNAL + 5; i++) journal.ajouter({ type: "reconnaissance", n: i });
  assert.equal(journal.lister().length, TAILLE_JOURNAL);
  assert.equal(JSON.parse(journal.exporter()).sessions.length, TAILLE_JOURNAL);
  stockage.setItem("test", "{ corrompu");
  assert.deepEqual(journal.lister(), []);
  journal.vider();
  assert.deepEqual(journal.lister(), []);
});

test("synthetiser agrège sessions, enrôlements et données métier", () => {
  const session = (fps, latence, delai, fournisseur = "wasm") => {
    const m = new MesuresReconnaissance({ fournisseur, chargementMs: 900 });
    for (let t = 0; t <= 1000; t += 1000 / fps) m.image(t);
    m.detection({ pretraitementMs: 10, inferenceMs: latence - 20, embeddingMs: 10, visages: 1 });
    m.decisions([{ score: 0.7 }]);
    m.observer([{ piste: 1, identifiant: null }], 0);
    m.observer([{ piste: 1, identifiant: "C001" }], delai);
    return m.resume(1000);
  };
  const enrolement = new MesuresEnrolement({ debut: 0 });
  for (let i = 0; i < 25; i++) enrolement.analyse(null);
  enrolement.analyse("Visage trop petit : rapprochez-vous");
  enrolement.terminer(15000);

  const clients = [
    { aGabarit: true, fiche: { conseiller: "Camille Conseil", preferences: { boisson: "café glacé" }, derniers_achats: [{ montant: 100 }, { montant: 300 }] } },
    { aGabarit: false, fiche: { conseiller: "Hugo Vendeur", preferences: { boisson: "café glacé" }, derniers_achats: [] } },
  ];
  const s = synthetiser([session(10, 60, 400), session(20, 80, 600), enrolement.resume(), { type: "reconnaissance", detections: 0 }], clients);
  assert.equal(s.sessions, 2, "la session sans détection est ignorée");
  assert.equal(s.enrolements, 1);
  assert.equal(s.clients, 2);
  assert.equal(s.clientsAvecVisage, 1);
  assert.equal(s.fpsMedian, 16, "11 et 21 images affichées en 1 s : médiane 16");
  assert.equal(s.latenceMedianeMs, 70);
  assert.equal(s.delaiMedianMs, 500);
  assert.equal(s.dureeEnrolementMedianeS, 15);
  assert.equal(s.refus["Visage trop petit : rapprochez-vous"], 1);
  assert.deepEqual(s.boissons, { "café glacé": 2 });
  assert.equal(s.panierMoyen, 200);
  assert.equal(s.historique.length, 2);
  assert.equal(s.histogrammeScores.reduce((t, c) => t + c.n, 0), 2);
});
