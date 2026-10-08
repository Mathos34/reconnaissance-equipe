// Test de parité : le pipeline JavaScript doit retrouver les mêmes visages et embeddings que InsightFace (Python).
// Activé seulement si PARITE_IMAGE (image JPEG) et PARITE_REFERENCE (JSON produit par InsightFace) sont définis.
// Ni l'image ni la référence ne sont versionnées : elles viennent d'un jeu d'exemple fourni avec InsightFace.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import jpeg from "jpeg-js";
import * as ort from "onnxruntime-node";

import { TAILLE_DETECTION, SEUIL_DETECTION, SEUIL_NMS } from "../js/config.js";
import { normaliser, similarite } from "../js/coeur/gabarit.js";
import { alignerVisage } from "../js/coeur/geometrie.js";
import { entreeDetection, entreeReconnaissance } from "../js/coeur/image.js";
import { decoderScrfd } from "../js/coeur/scrfd.js";

const ici = dirname(fileURLToPath(import.meta.url));
const dossierModeles = join(ici, "..", "models");
const imagePath = process.env.PARITE_IMAGE;
const referencePath = process.env.PARITE_REFERENCE;

test("parité avec InsightFace : mêmes visages, mêmes embeddings", { skip: !imagePath || !referencePath }, async () => {
  const reference = JSON.parse(readFileSync(referencePath, "utf8"));
  const decode = jpeg.decode(readFileSync(imagePath), { useTArray: true });
  const image = { width: decode.width, height: decode.height, data: decode.data };

  const session = await ort.InferenceSession.create(join(dossierModeles, "det_500m.onnx"));
  const reco = await ort.InferenceSession.create(join(dossierModeles, "w600k_mbf.onnx"));

  const { entree, echelle } = entreeDetection(image, TAILLE_DETECTION);
  const sortie = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", entree, [1, 3, TAILLE_DETECTION, TAILLE_DETECTION]) });
  const sorties = session.outputNames.map((nom) => sortie[nom].data);
  const visages = decoderScrfd(sorties, { taille: TAILLE_DETECTION, echelle, seuil: SEUIL_DETECTION, seuilNms: SEUIL_NMS });

  console.log(`visages JavaScript : ${visages.length}, Python : ${reference.visages.length}`);
  assert.equal(visages.length, reference.visages.length, "même nombre de visages");

  // Chaque visage Python doit avoir son équivalent JavaScript (même boîte à quelques pixels près).
  const erreurs = [];
  for (const attendu of reference.visages) {
    const trouve = visages
      .map((v) => ({ v, d: Math.max(...v.boite.map((x, i) => Math.abs(x - attendu.boite[i]))) }))
      .sort((a, b) => a.d - b.d)[0];
    erreurs.push(trouve.d);
    assert.ok(trouve.d < 4, `boîte trop éloignée : écart max ${trouve.d.toFixed(2)} px`);

    const alignement = alignerVisage(image, trouve.v.kps, 112);
    const brut = await reco.run({ [reco.inputNames[0]]: new ort.Tensor("float32", entreeReconnaissance(alignement), [1, 3, 112, 112]) });
    const embedding = normaliser(brut[reco.outputNames[0]].data);
    const cosinus = similarite(embedding, Float32Array.from(attendu.embedding));
    console.log(`  visage score JS ${trouve.v.score.toFixed(3)} / Python ${attendu.score.toFixed(3)}, écart boîte ${trouve.d.toFixed(2)} px, cosinus embedding ${cosinus.toFixed(4)}`);
    assert.ok(cosinus > 0.98, `embedding trop différent : cosinus ${cosinus.toFixed(4)}`);
  }
  console.log(`écart max des boîtes : ${Math.max(...erreurs).toFixed(2)} px`);
});
