// Génère la présentation anglaise de Maison Test (PowerPoint) à partir des mesures du projet.
// Thème : la maison de luxe fictive du site (papier, encre, or, titres en Georgia) et le cadre de détection
// de l'application (coins bleus et étiquette du nom), réservé à ce que le système « reconnaît ».
// Usage (depuis presentation/) : npm run deck

const path = require("path");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const QRCode = require("qrcode");
const D = require("./mesures");

const IMAGES = path.join(__dirname, "images");
const SORTIE = path.join(__dirname, "Maison-Test-client-recognition.pptx");
const SKILL_THEME = process.env.APPLY_THEME;
const EQUIPE = ["Rim Middi", "Felix Chevalier", "Jean-Baptiste Caron", "Mathis Lacombe"];

// ---------- formats ----------

const en = (v, d = 0) => (v === null || v === undefined ? "-" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const enCourt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 }); // 0.15 et non 0.2
// Espace insécable entre un nombre et son unité.
const insecables = (t) => t.replace(/(\d) (ms|s|m|px|MB|min|fps|cm)(?!\p{L})/gu, "$1 $2");
const typographier = (contenu) =>
  typeof contenu === "string" ? insecables(contenu) : contenu.map((run) => ({ ...run, text: insecables(run.text) }));

// ---------- thème ----------

const SERIF = "Georgia"; // titres du site
const SANS = "Segoe UI"; // texte du site
const SANS_FORT = "Segoe UI Semibold";
const CHIFFRES = "Bodoni MT"; // chiffres isolés : Georgia a des chiffres elzéviriens, son 0 se lit comme un o

const THEME = {
  name: "Maison Test",
  headFontFace: SERIF,
  bodyFontFace: SANS,
  colors: {
    dk1: "221C18", // encre
    lt1: "FFFFFF",
    dk2: "14110F", // nuit : couverture, chiffres, démo, conclusion
    lt2: "F5EFE6", // papier, le fond du site
    accent1: "A2761A", // or : détection
    accent2: "2A74A6", // bleu du cadre « reconnu » : reconnaissance
    accent3: "8F4A8C", // prune : préparation de l'image
    accent4: "6E645B", // texte discret
    accent5: "A8412F", // limites
    accent6: "2F6E46", // pistes
    hlink: "2A74A6",
    folHlink: "6E645B",
  },
};
const H = THEME.colors;
// Couleurs hors thème (options qui n'acceptent que l'hexadécimal, ou nuances de texte).
const OR_TEXTE = "82601A"; // or assombri pour les petits libellés sur papier (contraste AA)
const OR_NUIT = "D2B57A"; // or sur fond sombre, celui du mode sombre du site
const PAPIER_NUIT = "F5EFE6";
const DISCRET_NUIT = "B3A797";
const FILET = "DCD0BD";
const FILET_NUIT = "3D342D";
const CARTE = "FFFDF9";
// Palette des graphiques, validée (validate_palette.js, fond papier) : mêmes couleurs que les étapes du pipeline.
const SERIE = { prep: H.accent3, det: H.accent1, reco: H.accent2 };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13,33 x 7,5 pouces
pres.theme = { headFontFace: SERIF, bodyFontFace: SANS };
pres.title = "Maison Test: recognizing a client in under a second";
pres.subject = "Client recognition prototype running in the browser, Audencia course project";
pres.author = EQUIPE.join(", ");
const C = pres.SchemeColor;

const W = 13.333;
const MARGE = 0.8;
const LU = W - 2 * MARGE; // largeur utile

// ---------- gabarits ----------

const rubrique = (couleur, y = 0.5) => ({
  placeholder: { options: { name: "rubrique", type: "body", x: MARGE, y, w: 9, h: 0.3, fontFace: SANS_FORT, fontSize: 10.5, color: couleur, charSpacing: 3, margin: 0, valign: "top" }, text: "" },
});
const pied = (couleur) => ({
  text: { text: "MAISON TEST", options: { x: MARGE, y: 7.0, w: 3, h: 0.25, fontFace: SANS_FORT, fontSize: 8.5, color: couleur, charSpacing: 3, margin: 0 } },
});
const numero = (couleur) => ({ x: W - MARGE - 0.6, y: 7.0, w: 0.6, h: 0.25, fontFace: SANS_FORT, fontSize: 8.5, color: couleur, align: "right" });

pres.defineSlideMaster({
  title: "PAPIER",
  background: { color: H.lt2 },
  margin: [0.5, MARGE, 0.6, MARGE],
  objects: [
    rubrique(OR_TEXTE),
    { placeholder: { options: { name: "title", type: "title", x: MARGE, y: 0.82, w: LU, h: 0.8, fontFace: SERIF, fontSize: 28, color: C.text1, align: "left", valign: "top", margin: 0 }, text: "" } },
    pied(H.accent4),
  ],
  slideNumber: numero(H.accent4),
});

pres.defineSlideMaster({
  title: "NUIT",
  background: { color: H.dk2 },
  margin: [0.5, MARGE, 0.6, MARGE],
  objects: [
    rubrique(OR_NUIT),
    { placeholder: { options: { name: "title", type: "title", x: MARGE, y: 0.82, w: LU, h: 0.8, fontFace: SERIF, fontSize: 28, color: PAPIER_NUIT, align: "left", valign: "top", margin: 0 }, text: "" } },
    pied(DISCRET_NUIT),
  ],
  slideNumber: numero(DISCRET_NUIT),
});

pres.defineSlideMaster({
  title: "COUVERTURE",
  background: { color: H.dk2 },
  objects: [
    { text: { text: "Maison Test", options: { x: MARGE, y: 0.6, w: 4, h: 0.45, fontFace: SERIF, fontSize: 20, color: PAPIER_NUIT, charSpacing: 1.5, margin: 0 } } },
    rubrique(OR_NUIT, 1.7),
    { placeholder: { options: { name: "title", type: "title", x: MARGE, y: 2.05, w: 6.7, h: 2.0, fontFace: SERIF, fontSize: 44, color: PAPIER_NUIT, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MARGE, y: 4.2, w: 6.4, h: 0.8, fontFace: SANS, fontSize: 17, color: DISCRET_NUIT, valign: "top", margin: 0 }, text: "" } },
  ],
});

// ---------- éléments ----------

/** Nouvelle diapositive dont tous les textes passent par les espaces insécables. */
function diapositive(options) {
  const slide = pres.addSlide(options);
  const ajouter = slide.addText.bind(slide);
  slide.addText = (contenu, opts) => ajouter(typographier(contenu), opts);
  return slide;
}

function texte(slide, contenu, options) {
  slide.addText(contenu, { isTextBox: true, fontFace: SANS, color: C.text1, margin: 0, valign: "top", ...options });
}

function filet(slide, x, y, w, couleur = FILET, epaisseur = 0.75, nom = "filet") {
  slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: couleur, width: epaisseur }, objectName: nom });
}

/**
 * Le motif du deck : le cadre que l'application dessine autour d'un visage reconnu (coins et étiquette du nom).
 * Réservé à ce que le système « voit » : le visage de la couverture, la capture, le chiffre clé, le QR code.
 */
function cadre(slide, x, y, w, h, { couleur = C.accent2, trait = 0.035, bras = 0.32, etiquette = null, nom = "cadre" } = {}) {
  const barre = (bx, by, bw, bh, i) =>
    slide.addShape(pres.shapes.RECTANGLE, { x: bx, y: by, w: bw, h: bh, fill: { color: couleur }, line: { color: couleur, width: 0 }, objectName: `${nom}-coin-${i}` });
  barre(x, y, bras, trait, 1);
  barre(x, y, trait, bras, 2);
  barre(x + w - bras, y, bras, trait, 3);
  barre(x + w - trait, y, trait, bras, 4);
  barre(x, y + h - trait, bras, trait, 5);
  barre(x, y + h - bras, trait, bras, 6);
  barre(x + w - bras, y + h - trait, bras, trait, 7);
  barre(x + w - trait, y + h - bras, trait, bras, 8);
  if (etiquette) {
    const lw = 0.28 + 0.085 * etiquette.length;
    slide.addShape(pres.shapes.RECTANGLE, { x, y: y - 0.32, w: lw, h: 0.32, fill: { color: couleur }, line: { color: couleur, width: 0 }, objectName: `${nom}-etiquette-fond` });
    texte(slide, etiquette, { x, y: y - 0.32, w: lw, h: 0.32, fontFace: SANS_FORT, fontSize: 11, color: "FFFFFF", align: "center", valign: "middle", objectName: `${nom}-etiquette` });
  }
}

/** Repère numéroté posé sur une capture d'écran. */
function repere(slide, n, cx, cy, d = 0.34) {
  slide.addShape(pres.shapes.OVAL, { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color: C.accent1 }, line: { color: CARTE, width: 1.5 }, objectName: `repere-${n}` });
  texte(slide, String(n), { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fontFace: SANS_FORT, fontSize: 12, color: "FFFFFF", align: "center", valign: "middle" });
}

/** Petit libellé en capitales espacées. */
function libelle(slide, contenu, x, y, w, couleur = OR_TEXTE) {
  texte(slide, contenu, { x, y, w, h: 0.28, fontFace: SANS_FORT, fontSize: 9.5, color: couleur, charSpacing: 2.5 });
}

async function recadrer(fichier, zone) {
  const tampon = await sharp(path.join(IMAGES, fichier)).extract(zone).png().toBuffer();
  return `image/png;base64,${tampon.toString("base64")}`;
}

const axes = () => ({
  catAxisLabelColor: H.accent4,
  valAxisLabelColor: H.accent4,
  catAxisLabelFontFace: "+mn-lt",
  valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 11,
  valAxisLabelFontSize: 11,
  valGridLine: { color: "E4DACB", size: 0.75 },
  catGridLine: { style: "none" },
  catAxisLineColor: "CFC3B0",
  valAxisLineShow: false,
  dataLabelFontFace: "+mn-lt",
  dataLabelFontSize: 11,
  dataLabelColor: H.dk1,
  legendFontFace: "+mn-lt",
  legendFontSize: 12,
  legendColor: H.dk1,
  titleFontFace: "+mn-lt",
  titleFontSize: 13,
  titleColor: H.dk1,
  plotArea: { fill: { color: H.lt2 } },
  chartArea: { fill: { color: H.lt2 } },
});

// ---------- construction ----------

async function construire() {
  const { M, MG, defaut, demo, rob, auSeuil, taille, distanceFiable, distanceUtile, tauxUtile, enrolement, PARITE, TESTS, POIDS_MO } = D;
  const qr = `image/png;base64,${(await QRCode.toBuffer(D.URL_DEMO, { margin: 1, width: 600, color: { dark: `#${H.dk1}`, light: "#FFFFFF" } })).toString("base64")}`;
  // Le flux vidéo de la capture (visage pixélisé), et la page entière sans le bas coupé.
  const portrait = await recadrer("reconnaissance.png", { left: 322, top: 141, width: 491, height: 491 });
  const pageReconnaissance = await recadrer("reconnaissance.png", { left: 0, top: 0, width: 1920, height: 1000 });
  const nomDemo = D.demoHybride ? "hybrid mode, dedicated GPU" : "CPU (WASM)";

  // ===== The project =====
  pres.addSection({ title: "The project" });

  // 1. Couverture
  {
    const s = diapositive({ masterName: "COUVERTURE", sectionTitle: "The project" });
    s.addText("AUDENCIA  ·  COURSE PROJECT  ·  2026", { placeholder: "rubrique" });
    s.addText("Recognizing a client in under a second", { placeholder: "title" });
    s.addText("A client recognition prototype for a fictional luxury boutique, running entirely in the browser.", { placeholder: "body" });
    texte(s, EQUIPE.join("   ·   "), { x: MARGE, y: 5.75, w: 7.2, h: 0.35, fontSize: 13, color: PAPIER_NUIT, objectName: "equipe" });
    texte(s, [
      { text: "Live demo   ", options: { fontFace: SANS_FORT, color: OR_NUIT } },
      { text: "mathos34.github.io/reconnaissance-equipe", options: { color: OR_NUIT } },
    ], { x: MARGE, y: 6.2, w: 7.2, h: 0.35, fontSize: 12, objectName: "lien-demo" });

    // Le visage pixélisé, avec le cadre et l'étiquette que dessine l'application.
    const px = 8.13, py = 1.55, taillePortrait = 4.4, e = taillePortrait / 491;
    s.addImage({ data: portrait, x: px, y: py, w: taillePortrait, h: taillePortrait, objectName: "portrait", altText: "Pixelated face seen by the camera, framed and labelled Claire Test" });
    cadre(s, px + 79 * e - 0.06, py + 42 * e - 0.06, 332 * e + 0.12, 402 * e + 0.12, { etiquette: "Claire Test", nom: "cadre-portrait" });
    texte(s, "Faces are pixelated in every screenshot.", { x: px, y: py + taillePortrait + 0.12, w: taillePortrait, h: 0.3, fontSize: 10, color: DISCRET_NUIT });
    s.addNotes(
      "Hook: in a luxury boutique, the welcome is decided in the first few seconds. " +
        "We built a prototype that recognizes a registered client and shows their card to the advisor, with nothing but a webcam and a browser. " +
        "The demo is live: anyone can try it from the link. Plan: the project, the numbers, a four-minute demo, then the limits, which are the most interesting part.",
    );
  }

  // 2. L'idée
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "The project" });
    s.addText("THE IDEA", { placeholder: "rubrique" });
    s.addText("In a luxury boutique, the welcome happens in seconds", { placeholder: "title" });
    texte(s, "« Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ? »", {
      x: MARGE, y: 1.95, w: 6.6, h: 2.5, fontFace: SERIF, fontSize: 32, italic: true, objectName: "citation",
    });
    texte(s, [
      { text: "“Good morning Mrs Test, an iced coffee with no sugar, as usual?”", options: { italic: true, breakLine: true } },
      { text: "The welcome line the app writes from the client card and the time of day." },
    ], { x: MARGE, y: 4.2, w: 6.3, h: 0.8, fontSize: 13, color: C.accent4 });

    const notes = [
      ["Recognize without asking", "A registered client is identified as soon as they step into the camera's view."],
      ["Remember preferences", "Drink, sugar, milk, style, recent purchases, advisor notes."],
      ["Fit the moment", "The suggestion changes before and after noon and recalls the last visit."],
    ];
    notes.forEach(([titre, detail], i) => {
      const y = 1.95 + i * 1.2;
      texte(s, `0${i + 1}`, { x: 8.1, y: y - 0.04, w: 0.6, h: 0.4, fontFace: CHIFFRES, fontSize: 18, color: OR_TEXTE });
      texte(s, titre, { x: 8.75, y, w: 3.8, h: 0.35, fontFace: SANS_FORT, fontSize: 16 });
      texte(s, detail, { x: 8.75, y: y + 0.38, w: 3.8, h: 0.7, fontSize: 13, color: C.accent4 });
    });
    filet(s, MARGE, 5.75, LU, C.accent1, 0.75, "filet-question");
    texte(s, "Our question: how far can AI help a sales advisor, and where does it stop?", { x: MARGE, y: 5.92, w: LU, h: 0.5, fontFace: SERIF, fontSize: 18, italic: true });
    s.addNotes(
      "The setting: a fictional boutique, Maison Test. The clients are team members with invented client cards. " +
        "The goal is not to sell a product but to test a concept: is it feasible, how fast is it, and what gets in the way?",
    );
  }

  // 3. Ce que nous avons construit
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "The project" });
    s.addText("WHAT WE BUILT", { placeholder: "rubrique" });
    s.addText("A complete app, published and usable from a link", { placeholder: "title" });
    const x0 = MARGE, y0 = 1.85, largeur = 8.0, e = largeur / 1920;
    s.addImage({ data: pageReconnaissance, x: x0, y: y0, w: largeur, h: 1000 * e, objectName: "capture-reconnaissance", altText: "Recognition page: framed face labelled Claire Test, live indicators, client card and welcome line" });
    s.addShape(pres.shapes.RECTANGLE, { x: x0, y: y0, w: largeur, h: 1000 * e, fill: { type: "none" }, line: { color: FILET, width: 0.75 }, objectName: "capture-bord" });
    // Le cadre que l'application dessine (masqué par la pixélisation de la capture).
    cadre(s, x0 + 401 * e, y0 + 183 * e, 332 * e, 402 * e, { etiquette: "Claire Test", bras: 0.22, trait: 0.03, nom: "cadre-capture" });
    // Repères dans les marges de la capture, pour ne masquer aucun texte (coordonnées en pixels de l'image).
    const reperes = [[131, 141], [95, 683], [1058, 255], [1050, 545]];
    reperes.forEach(([px, py], i) => repere(s, i + 1, x0 + px * e, y0 + py * e));

    const legende = [
      ["Live recognition", "A frame and a name on each face, “Inconnu” (unknown) otherwise."],
      ["Live indicators", "Speed, delay and similarity, measured while it runs."],
      ["Client card", "Preferences, purchases, advisor notes, next appointment."],
      ["Welcome line", "Written from the card and the time of day."],
    ];
    legende.forEach(([titre, detail], i) => {
      const y = 1.9 + i * 0.95;
      repere(s, i + 1, 9.32, y + 0.17, 0.3);
      texte(s, titre, { x: 9.65, y, w: 2.9, h: 0.33, fontFace: SANS_FORT, fontSize: 14.5 });
      texte(s, detail, { x: 9.65, y: y + 0.34, w: 2.9, h: 0.55, fontSize: 12, color: C.accent4 });
    });
    filet(s, 9.15, 5.75, 3.38);
    texte(s, "Two more pages: Clients (consent, guided capture, card) and Indicators (dashboard). The interface is in French.", { x: 9.15, y: 5.85, w: 3.38, h: 0.75, fontSize: 11, color: C.accent4 });
    s.addNotes(
      "Three pages: Recognition for the advisor, Clients for sign-up, Indicators for monitoring. " +
        "The site is hosted on GitHub Pages: no server and nothing to install. Faces in the screenshots are pixelated; the frame and label are what the app draws.",
    );
  }

  // 4. Fonctionnement
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "The project" });
    s.addText("HOW IT WORKS", { placeholder: "rubrique" });
    s.addText("No server: all the AI runs in the browser", { placeholder: "title" });
    const etapes = [
      ["Camera", "1 frame in 3 analyzed", SERIE.prep],
      ["Detection", "SCRFD, 2.4 MB", SERIE.det],
      ["Recognition", "MobileFaceNet, 13 MB", SERIE.reco],
      ["Tracking", "3 of 5 decisions must agree", H.dk1],
      ["Client card", "Time-of-day suggestion", H.dk1],
    ];
    const yLigne = 2.6;
    const pas = LU / etapes.length;
    filet(s, MARGE + pas / 2, yLigne, LU - pas, "B9AC97", 1.25, "ligne-pipeline");
    etapes.forEach(([titre, detail, couleur], i) => {
      const cx = MARGE + pas * (i + 0.5);
      s.addShape(pres.shapes.OVAL, { x: cx - 0.11, y: yLigne - 0.11, w: 0.22, h: 0.22, fill: { color: couleur }, line: { color: H.lt2, width: 2 }, objectName: `station-${i}` });
      texte(s, titre, { x: cx - pas / 2, y: yLigne - 0.62, w: pas, h: 0.35, fontFace: SANS_FORT, fontSize: 15, align: "center" });
      texte(s, detail, { x: cx - pas / 2 + 0.1, y: yLigne + 0.25, w: pas - 0.2, h: 0.55, fontSize: 12.5, color: C.accent4, align: "center" });
    });
    const faits = [
      ["0", "images leave the device", "Unknown faces are processed in memory and never stored."],
      [en(POIDS_MO, 1), "MB of models", "Downloaded once, then cached. ONNX Runtime Web, on WebGPU or WebAssembly."],
      ["512", "numbers per client", "The only biometric data kept, after typed consent. No photo is stored."],
    ];
    const lc = (LU - 2 * 0.5) / 3;
    faits.forEach(([valeur, unite, detail], i) => {
      const x = MARGE + i * (lc + 0.5);
      filet(s, x, 3.75, lc, C.accent1, 0.75, `fait-filet-${i}`);
      texte(s, [
        { text: valeur, options: { fontFace: CHIFFRES, fontSize: 44, color: C.text1 } },
        { text: `  ${unite}`, options: { fontFace: SANS_FORT, fontSize: 14, color: C.text1 } },
      ], { x, y: 3.9, w: lc, h: 0.8, valign: "bottom" });
      texte(s, detail, { x, y: 4.8, w: lc, h: 0.75, fontSize: 13, color: C.accent4 });
    });
    texte(s, `Same models as our first Python version (InsightFace buffalo_s), ported to JavaScript and checked against it: faces within ${en(PARITE.ecartPx, 2)} px, signatures at ${en(PARITE.cosinus, 4)} similarity.`, {
      x: MARGE, y: 6.05, w: LU, h: 0.55, fontFace: SERIF, fontSize: 13.5, italic: true, color: C.accent4,
    });
    s.addNotes(
      "The key technical point: nothing goes to a server. The browser downloads two models, 15 MB in total, and does all the computing. " +
        "We first built a Python version, then ported the pipeline to JavaScript and checked that both give the same results to within a fraction of a pixel. " +
        "The station colors are the ones used in the timing chart two slides later.",
    );
  }

  // ===== Results =====
  pres.addSection({ title: "Results" });

  // 5. Chiffres clés
  {
    const s = diapositive({ masterName: "NUIT", sectionTitle: "Results" });
    s.addText("RESULTS", { placeholder: "rubrique" });
    s.addText("The numbers, measured by the app itself", { placeholder: "title" });
    // Le chiffre clé, encadré comme un visage reconnu.
    cadre(s, MARGE, 2.3, 5.0, 2.0, { etiquette: "Median delay", couleur: H.accent2, nom: "cadre-chiffre" });
    texte(s, `${en(demo.delai / 1000, 2)} s`, { x: MARGE + 0.3, y: 2.45, w: 4.4, h: 1.7, fontFace: CHIFFRES, fontSize: 96, color: PAPIER_NUIT, valign: "middle", objectName: "chiffre-cle" });
    texte(s, `From a face entering the frame to the client card on screen, on the demo PC. ${en(defaut.delai / 1000, 2)} s on CPU only.`, {
      x: MARGE, y: 4.55, w: 5.0, h: 0.8, fontSize: 14, color: DISCRET_NUIT,
    });

    const lignes = [
      ["Time per analysis", `${en(defaut.tot)} ms on CPU only`, `${en(demo.tot)} ms`],
      ["Display rate", `${en(demo.analyses, 1)} analyses per second`, `${en(demo.fps)} fps`],
      ["Enrolling a client", `25 valid images across 5 poses`, `${en(enrolement.dureeS, 1)} s`],
      ["False accepts at threshold 0.35", `${rob.identites} identities, ${Object.keys(rob.conditions).length} degraded conditions`, `${en(auSeuil.far)}%`],
      ["Reliable range", `${en(tauxUtile)}% still identified at ${en(distanceUtile, 1)} m`, `${en(distanceFiable, 1)} m`],
      ["JavaScript vs Python gap", `${en(PARITE.cosinus, 4)} signature similarity`, `${en(PARITE.ecartPx, 2)} px`],
      ["Automated tests", `${TESTS.js} web, ${TESTS.python} Python, plus end to end`, `${TESTS.js + TESTS.python}`],
    ];
    const x = 6.6, lw = W - MARGE - x, h = 0.64;
    lignes.forEach(([titre, detail, valeur], i) => {
      const y = 1.9 + i * h;
      if (i) filet(s, x, y, lw, FILET_NUIT, 0.75, `registre-filet-${i}`);
      texte(s, titre, { x, y: y + 0.07, w: lw - 1.7, h: 0.28, fontSize: 14, color: PAPIER_NUIT });
      texte(s, detail, { x, y: y + 0.35, w: lw - 1.7, h: 0.25, fontSize: 10.5, color: DISCRET_NUIT });
      texte(s, valeur, { x: x + lw - 1.7, y: y + 0.05, w: 1.7, h: 0.52, fontFace: CHIFFRES, fontSize: 26, color: OR_NUIT, align: "right", valign: "middle" });
    });
    texte(s, "Edge 156  ·  Ryzen 7 5800H  ·  RTX 3060  ·  medians of 5 sessions of 12 s", { x, y: 6.55, w: lw, h: 0.25, fontSize: 9.5, color: DISCRET_NUIT });
    s.addNotes(
      "These numbers come from reproducible measurements (the evaluation folder of the repository): performance in Edge on a Ryzen 7 5800H with an RTX 3060, robustness with the same models. " +
        `The delay, time per analysis and display rate are for the demo setting (${nomDemo}); the public site uses the CPU by default. ` +
        "The delay includes smoothing: three matching decisions are needed before a name is shown, to avoid mistakes.",
    );
  }

  // 6. Moteur de calcul
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Results" });
    s.addText("RESULTS  ·  SPEED", { placeholder: "rubrique" });
    s.addText("Measuring changed our engine choice", { placeholder: "title" });
    const lignes = [
      ["CPU (WASM)", M.wasm],
      ["WebGPU, integrated GPU", M.webgpu],
      ["Hybrid, integrated GPU", M.hybride],
      ["WebGPU, RTX 3060", MG.webgpu],
      ["Hybrid, RTX 3060", MG.hybride],
    ].filter(([, v]) => v);
    s.addChart(
      pres.charts.BAR,
      [
        { name: "Image preparation", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].pre)) },
        { name: "Face detection", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].det)) },
        { name: "Recognition", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].emb)) },
      ],
      {
        x: MARGE - 0.1, y: 1.75, w: 7.6, h: 4.95, barDir: "bar", barGrouping: "stacked", barGapWidthPct: 55,
        chartColors: [SERIE.prep, SERIE.det, SERIE.reco], showValue: true, dataLabelPosition: "ctr",
        showLegend: true, legendPos: "b", showTitle: true, title: "Time per analysis, by stage (ms, median of 5 sessions)",
        catAxisOrientation: "maxMin", ...axes(), dataLabelColor: "FFFFFF", dataLabelFontBold: true,
      },
    );
    const x = 8.75, lw = W - MARGE - x;
    const recoGpu = [M.webgpu?.emb, MG.webgpu?.emb].filter(Boolean);
    const constats = [
      `Recognition is 3 to 4 times slower on the graphics card, whichever card (${en(Math.min(...recoGpu))} to ${en(Math.max(...recoGpu))} ms vs ${en(M.wasm.emb)} ms).`,
      MG.hybride ? `Detection only speeds up on the dedicated card (${en(MG.hybride.det)} ms vs ${en(M.wasm.det)} ms).` : "Detection only speeds up on a dedicated card.",
      MG.hybride ? `So: CPU by default, hybrid on the demo PC. ${en(MG.hybride.tot)} ms per analysis, ${en(MG.hybride.delai / 1000, 2)} s to the card.` : "So: CPU by default.",
    ];
    constats.forEach((c, i) => {
      const y = 1.95 + i * 1.0;
      texte(s, String(i + 1), { x, y: y - 0.06, w: 0.4, h: 0.4, fontFace: CHIFFRES, fontSize: 22, color: OR_TEXTE });
      texte(s, c, { x: x + 0.45, y, w: lw - 0.45, h: 0.9, fontSize: 13.5 });
    });
    filet(s, x, 5.2, lw, C.accent1, 0.75, "filet-lecon");
    texte(s, "Without measuring, we would have concluded “the GPU makes everything faster”. The browser was in fact using the integrated GPU.", {
      x, y: 5.35, w: lw, h: 1.1, fontFace: SERIF, fontSize: 14, italic: true,
    });
    s.addNotes(
      "An analysis has three stages, each timed separately by the app. " +
        "First surprise: the browser was using the processor's integrated GPU, not the RTX. Second surprise: even on the RTX, recognition is slower than on the CPU, " +
        "probably because some of the model's operations are not supported by WebGPU. " +
        "Hence a safe default (CPU) and a hybrid mode for the demo PC, once the dedicated card is enabled for Edge in the Windows graphics settings.",
    );
  }

  // 7. Distance
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Results" });
    s.addText("RESULTS  ·  RANGE", { placeholder: "rubrique" });
    s.addText(`Reliable up to about ${en(distanceFiable, 0)} m from the camera`, { placeholder: "title" });
    const niveaux = [...taille].sort((a, b) => a.distanceEstimeeM - b.distanceEstimeeM);
    s.addChart(
      pres.charts.LINE,
      [{ name: "Correctly identified", labels: niveaux.map((n) => `${en(n.distanceEstimeeM, 1)} m`), values: niveaux.map((n) => n.identification) }],
      {
        x: MARGE - 0.1, y: 1.75, w: 8.0, h: 4.85, chartColors: [SERIE.reco], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 8,
        valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, valAxisLabelFormatCode: "0\"%\"",
        showLegend: false, showTitle: true, title: "Clients correctly identified, by estimated distance to the camera", ...axes(),
      },
    );
    const x = 9.15, lw = W - MARGE - x;
    libelle(s, "READING", x, 1.9, lw);
    const lecture = [
      `100% up to ${en(distanceFiable, 1)} m, still ${en(tauxUtile)}% at ${en(distanceUtile, 1)} m.`,
      "Beyond 4 m the face is under 35 px wide and is no longer detected.",
      ...(D.limiteParDetection ? ["Every detected face was recognized: detection is the limit."] : []),
      "Takeaway: camera near the entrance, at face height.",
    ];
    lecture.forEach((t, i) => {
      const y = 2.3 + i * 0.85;
      texte(s, String(i + 1), { x, y: y - 0.05, w: 0.35, h: 0.35, fontFace: CHIFFRES, fontSize: 19, color: OR_TEXTE });
      texte(s, t, { x: x + 0.4, y, w: lw - 0.4, h: 0.8, fontSize: 14 });
    });
    texte(s, "Distance estimated for an HD webcam with a 70° field of view and a 15 cm face. 6 identities, same source photo.", { x, y: 5.85, w: lw, h: 0.7, fontSize: 10.5, color: C.accent4 });
    s.addNotes(
      "We simulated distance by shrinking the face inside an HD frame. Converting to meters is a geometric estimate. " +
        "The message for a store: placement matters, and the useful range is about two meters.",
    );
  }

  // 8. Robustesse
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Results" });
    s.addText("RESULTS  ·  ROBUSTNESS", { placeholder: "rubrique" });
    s.addText("Handles light well, struggles with blur and covered faces", { placeholder: "title" });
    const grille = [
      ["luminosite", "Exposure (×)", enCourt],
      ["flou", "Blur (px)", (v) => en(v)],
      ["rotation", "Head tilt (°)", (v) => en(v)],
      ["occultation", "Lower face covered (%)", (v) => en(v * 100)],
      ["bruit", "Sensor noise", (v) => en(v)],
      ["compression", "JPEG quality", (v) => en(v)],
    ];
    const cw = (LU - 2 * 0.3) / 3;
    const ch = 2.3;
    grille.forEach(([cle, titre, format], i) => {
      const niveaux = rob.conditions[cle].niveaux;
      s.addChart(
        pres.charts.LINE,
        [{ name: "Correctly identified", labels: niveaux.map((n) => format(n.niveau)), values: niveaux.map((n) => n.identification) }],
        {
          x: MARGE - 0.1 + (i % 3) * (cw + 0.3), y: 1.75 + Math.floor(i / 3) * (ch + 0.15), w: cw + 0.1, h: ch,
          chartColors: [SERIE.reco], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 6,
          valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 50, valAxisLabelFormatCode: "0\"%\"",
          showLegend: false, showTitle: true, title: titre, ...axes(), catAxisLabelFontSize: niveaux.length > 9 ? 9 : 10, valAxisLabelFontSize: 10,
        },
      );
    });
    texte(s, `Correct identification rate at threshold 0.35, ${rob.identites} identities, one point per level. Degradation increases to the right, except exposure: 1 = normal, darker to the left, brighter to the right.`, {
      x: MARGE, y: 6.58, w: LU, h: 0.35, fontSize: 10.5, color: C.accent4,
    });
    s.addNotes(
      "Six kinds of degradation, from mild to severe. The model copes very well with dim or bright light and with compression. " +
        "It breaks down with heavy blur, a head tilted 90 degrees, or more than half of the face covered. " +
        "Caveat: enrollment and test start from the same photo, so real conditions will be less favorable.",
    );
  }

  // 9. Seuil
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Results" });
    s.addText("RESULTS  ·  ACCURACY", { placeholder: "rubrique" });
    s.addText(`At threshold 0.35: ${en(auSeuil.far)}% false accepts, ${en(auSeuil.frr, 1)}% false rejects`, { placeholder: "title" });
    // Histogramme regroupé par pas de 0,1, en part de chaque population (les imposteurs sont 5 fois plus nombreux).
    const regrouper = (h) => {
      const total = h.reduce((t, c) => t + c.n, 0);
      const classes = [];
      for (let i = 0; i < h.length; i += 2) classes.push({ debut: h[i].debut, part: (100 * (h[i].n + (h[i + 1]?.n ?? 0))) / total });
      return classes;
    };
    const meme = regrouper(rob.distributions.memePersonne.histogramme);
    const imp = regrouper(rob.distributions.imposteurs.histogramme);
    const etiquettes = meme.map((c) => en(c.debut, 1));
    s.addChart(
      pres.charts.BAR,
      [
        { name: "Same person", labels: etiquettes, values: meme.map((c) => +c.part.toFixed(1)) },
        { name: "Someone else", labels: etiquettes, values: imp.map((c) => +c.part.toFixed(1)) },
      ],
      {
        x: MARGE - 0.1, y: 1.75, w: 6.1, h: 4.55, barDir: "col", barGrouping: "clustered", barGapWidthPct: 40,
        chartColors: [SERIE.reco, SERIE.det], showLegend: true, legendPos: "b", showTitle: true,
        title: "Face-to-template similarity (share of comparisons)", valAxisLabelFormatCode: "0\"%\"", ...axes(),
      },
    );
    const seuils = rob.courbe.filter((c) => Math.round(c.seuil * 100) % 5 === 0 && c.seuil <= 0.8);
    s.addChart(
      pres.charts.LINE,
      [
        { name: "False rejects (FRR)", labels: seuils.map((c) => en(c.seuil, 2)), values: seuils.map((c) => c.frr) },
        { name: "False accepts (FAR)", labels: seuils.map((c) => en(c.seuil, 2)), values: seuils.map((c) => c.far) },
      ],
      {
        x: 7.15, y: 1.75, w: 5.4, h: 3.55, chartColors: [SERIE.reco, SERIE.det], lineSize: 2, lineDataSymbol: "none",
        valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelFormatCode: "0\"%\"", showLegend: true, legendPos: "b",
        showTitle: true, title: "Error rates by threshold", ...axes(), catAxisLabelFrequency: 2,
      },
    );
    texte(s, `The two groups are well apart: other people never go above ${en(rob.distributions.imposteurs.max, 2)} similarity. Threshold 0.35 favors never showing the wrong card: better an “Inconnu” than the wrong name.`, {
      x: 7.3, y: 5.45, w: 5.23, h: 1.0, fontSize: 13,
    });
    texte(s, `Indicative evaluation: ${rob.identites} identities, same source photo for enrollment and test, all degraded conditions combined.`, { x: MARGE, y: 6.4, w: 6.0, h: 0.45, fontSize: 10.5, color: C.accent4 });
    s.addNotes(
      "The threshold sets the trade-off: too low and we show someone else's card; too high and we stop recognizing clients. " +
        "In luxury retail, showing the wrong name is worse than showing nothing, hence a cautious threshold. " +
        `The ${en(auSeuil.frr, 1)}% of false rejects come mostly from extreme conditions (heavy blur, covered face).`,
    );
  }

  // ===== Demo =====
  pres.addSection({ title: "Demo" });

  // 10. Démo
  {
    const s = diapositive({ masterName: "NUIT", sectionTitle: "Demo" });
    s.addText("LIVE DEMO", { placeholder: "rubrique" });
    s.addText("From sign-up to welcome in four minutes", { placeholder: "title" });
    const etapes = [
      ["0:00", "Sign up a client", "Clients page: the person types J'ACCEPTE, then 25 images are captured across 5 poses."],
      ["1:15", "Fill in the card", "Drink, sugar, milk, style, recent purchases, next appointment."],
      ["2:15", "Recognize them", "Recognition page: the person steps in and the card appears. Another team member stays “Inconnu”."],
      ["3:15", "Read the indicators", "Delay, time per stage, enrollment quality."],
      ["4:00", "Questions", ""],
    ];
    const xLigne = MARGE + 1.3;
    s.addShape(pres.shapes.LINE, { x: xLigne, y: 2.05, w: 0, h: 4.0, line: { color: FILET_NUIT, width: 1.25 }, objectName: "ligne-temps" });
    etapes.forEach(([heure, titre, detail], i) => {
      const y = 1.9 + i * 1.0;
      texte(s, heure, { x: MARGE, y: y - 0.06, w: 1.05, h: 0.45, fontFace: CHIFFRES, fontSize: 26, color: OR_NUIT, align: "right" });
      s.addShape(pres.shapes.OVAL, { x: xLigne - 0.07, y: y + 0.1, w: 0.14, h: 0.14, fill: { color: OR_NUIT }, line: { color: H.dk2, width: 1.5 }, objectName: `etape-${i}` });
      texte(s, titre, { x: xLigne + 0.35, y, w: 5.6, h: 0.35, fontFace: SANS_FORT, fontSize: 17, color: PAPIER_NUIT });
      if (detail) texte(s, detail, { x: xLigne + 0.35, y: y + 0.37, w: 5.6, h: 0.55, fontSize: 12.5, color: DISCRET_NUIT });
    });
    // Le QR code, encadré comme ce que la caméra va lire.
    const xq = 9.75, yq = 2.15, cq = 2.1;
    s.addShape(pres.shapes.RECTANGLE, { x: xq, y: yq, w: cq, h: cq, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, objectName: "qr-fond" });
    s.addImage({ data: qr, x: xq + 0.1, y: yq + 0.1, w: cq - 0.2, h: cq - 0.2, objectName: "qr-demo", altText: "QR code to the live demo" });
    cadre(s, xq - 0.18, yq - 0.18, cq + 0.36, cq + 0.36, { etiquette: "Try it", nom: "cadre-qr" });
    texte(s, "Open the demo on your phone while we run it.", { x: xq - 0.18, y: yq + cq + 0.3, w: cq + 0.36, h: 0.5, fontSize: 11.5, color: DISCRET_NUIT, align: "center" });
    filet(s, 9.2, 5.3, W - MARGE - 9.2, FILET_NUIT, 0.75, "filet-plan-b");
    libelle(s, "PLAN B", 9.2, 5.42, 3.3, OR_NUIT);
    texte(s, [
      { text: "Open with ?moteur=wasm to use the CPU.", options: { breakLine: true } },
      { text: "Import the prepared JSON backup.", options: { breakLine: true } },
      { text: "Next slide: the same flow in screenshots." },
    ], { x: 9.2, y: 5.72, w: W - MARGE - 9.2, h: 0.85, fontSize: 11.5, color: DISCRET_NUIT, paraSpaceAfter: 3 });
    s.addNotes(
      "Before the session: in Windows, Settings, Display, Graphics, set Microsoft Edge to High performance (RTX 3060); this is already done on the demo PC. " +
        "Open the site once with ?moteur=hybride (the choice is remembered), allow the camera, check that the light falls on the person's face, " +
        "and load the models once (15 MB) to avoid waiting. Keep a JSON export with an enrolled client. " +
        "During the demo, also show the Hide card button, and bring in someone who is not registered to show “Inconnu”.",
    );
  }

  // 11. Parcours en images
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Demo" });
    s.addText("DEMO  ·  BACKUP", { placeholder: "rubrique" });
    s.addText("The same flow in screenshots", { placeholder: "title" });
    const vues = [
      ["capture.png", "1. Consent first, then guided capture in 5 poses", "Clients page during capture"],
      ["fiche.png", "2. Card: preferences, purchases, appointment", "Client card form"],
      ["indicateurs.png", "3. Indicators measured during the demo", "Indicators dashboard"],
    ];
    const ecart = 0.35, petite = 3.75, grande = LU - petite - ecart;
    const [principale, ...autres] = vues;
    const image = (fichier, x, y, w, nom, alt) => {
      s.addImage({ path: path.join(IMAGES, fichier), x, y, w, h: (w * 9) / 16, objectName: nom, altText: alt });
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: (w * 9) / 16, fill: { type: "none" }, line: { color: FILET, width: 0.75 }, objectName: `${nom}-bord` });
    };
    image(principale[0], MARGE, 1.75, grande, "vue-0", principale[2]);
    texte(s, principale[1], { x: MARGE, y: 1.75 + (grande * 9) / 16 + 0.12, w: grande, h: 0.35, fontFace: SANS_FORT, fontSize: 14 });
    texte(s, "Recognition itself is on slide 3. Simulated camera, faces pixelated.", { x: MARGE, y: 6.45, w: grande, h: 0.3, fontSize: 10.5, color: C.accent4 });
    autres.forEach(([fichier, legende, alt], i) => {
      const x = MARGE + grande + ecart;
      const y = 1.75 + i * 2.5;
      image(fichier, x, y, petite, `vue-${i + 1}`, alt);
      texte(s, legende, { x, y: y + (petite * 9) / 16 + 0.08, w: petite, h: 0.3, fontFace: SANS_FORT, fontSize: 12 });
    });
    s.addNotes("Backup slide: if the camera or the network fails, walk through the flow from these screenshots.");
  }

  // ===== Limits =====
  pres.addSection({ title: "Limits" });

  // 12. Limites techniques
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Limits" });
    s.addText("LIMITS  ·  TECHNICAL", { placeholder: "rubrique" });
    s.addText("Technical limits, and what we would do next", { placeholder: "title" });
    const lignes = [
      ["Evaluated on 6 identities, one photo per person", "Test with a volunteer panel over several days, with glasses and different hairstyles"],
      ["No spoofing detection: a photo of a photo works", "Add liveness detection (blinking, depth)"],
      ["Database stored in a single browser", "Shared, encrypted database across the boutique's devices"],
      ["Poses are guided but not checked during enrollment", "Check head angle from the facial landmarks"],
      [`${en(defaut.tot)} ms per analysis, on a single CPU core`, "Enable multithreading (site headers) and an optimized model"],
      [`Usable range about ${en(distanceFiable, 0)} m, sensitive to blur`, "Better placed, higher resolution camera, front lighting"],
    ];
    const xa = MARGE + 0.6, xb = 6.95;
    libelle(s, "WHAT WE SAW", xa, 1.9, 5, H.accent5);
    libelle(s, "WHAT WE WOULD DO", xb, 1.9, 5, H.accent6);
    lignes.forEach(([limite, piste], i) => {
      const y = 2.3 + i * 0.7;
      filet(s, MARGE, y, LU, FILET, 0.75, `limite-filet-${i}`);
      texte(s, `0${i + 1}`, { x: MARGE, y: y + 0.12, w: 0.5, h: 0.5, fontFace: CHIFFRES, fontSize: 17, color: OR_TEXTE, valign: "middle" });
      texte(s, limite, { x: xa, y: y + 0.12, w: xb - xa - 0.3, h: 0.5, fontSize: 14, valign: "middle" });
      texte(s, piste, { x: xb, y: y + 0.12, w: W - MARGE - xb, h: 0.5, fontSize: 14, valign: "middle", color: C.accent4 });
    });
    filet(s, MARGE, 2.3 + lignes.length * 0.7, LU, FILET, 0.75, "limite-filet-fin");
    s.addNotes(
      "We would rather be upfront: a proof of concept shows feasibility, not reliability in real conditions. " +
        "The first limit matters most: our evaluation is small and optimistic. The second is a real risk in production.",
    );
  }

  // 13. Limites légales
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Limits" });
    s.addText("LIMITS  ·  LEGAL", { placeholder: "rubrique" });
    s.addText("Legally, biometrics is the real issue", { placeholder: "title" });
    const blocs = [
      ["REGULATION (EU) 2016/679", "GDPR, Article 9", "Biometric data is prohibited by default. The usable exception is explicit, freely given consent, so a face-free alternative must exist."],
      ["REGULATION (EU) 2024/1689", "EU AI Act", "Remote biometric identification is listed as high risk (Annex III). The obligations were pushed back to 2 December 2027 by the June 2026 Omnibus agreement."],
      ["CNIL, FRENCH DATA PROTECTION AUTHORITY", "Consent and impact assessment", "Walking into a shop is not consent. A data protection impact assessment is required before any deployment."],
      ["INSIGHTFACE", "Model license", "The models we used are for non-commercial research only. A real deployment needs commercially licensed models."],
    ];
    const lc = (LU - 0.6) / 2;
    blocs.forEach(([source, titre, detail], i) => {
      const x = MARGE + (i % 2) * (lc + 0.6);
      const y = 1.9 + Math.floor(i / 2) * 2.0;
      filet(s, x, y, lc, C.text1, 1, `legal-filet-${i}`);
      libelle(s, source, x, y + 0.15, lc, C.accent4);
      texte(s, titre, { x, y: y + 0.45, w: lc, h: 0.45, fontFace: SERIF, fontSize: 20 });
      texte(s, detail, { x, y: y + 0.95, w: lc, h: 0.9, fontSize: 13, color: C.accent4 });
    });
    filet(s, MARGE, 5.95, LU, C.accent1, 0.75, "filet-applique");
    texte(s, "What we applied: dated “J'ACCEPTE” consent before any capture, no photo stored, unknown faces never saved, deletion on request. Not an exhaustive analysis; to be reviewed by a lawyer.", {
      x: MARGE, y: 6.07, w: LU, h: 0.6, fontFace: SERIF, fontSize: 13, italic: true,
    });
    s.addNotes(
      "Sources: GDPR Article 9; AI Act, Annex III point 1(a); Omnibus agreement voted by Parliament on 16 June 2026 and approved by the Council on 29 June 2026, Official Journal publication to be checked; " +
        "CNIL positions on smart cameras in stores as reported in the press. This is not legal advice.",
    );
  }

  // 14. Limites matérielles
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Limits" });
    s.addText("LIMITS  ·  HARDWARE", { placeholder: "rubrique" });
    s.addText("The camera matters as much as the model", { placeholder: "title" });
    const lignes = [
      ["Camera", `HD webcam at least. Beyond ${en(distanceFiable, 0)} m or with motion blur, recognition drops.`],
      ["Lighting", "Copes with dim light, but backlight or strong side light hurts detection."],
      ["Placement", "At the entrance, at face height, facing the flow. Several people at once: one card shown."],
      ["Computer", `A recent PC: ${en(defaut.tot)} ms per analysis on a Ryzen 7 5800H. An older PC or a tablet will be slower.`],
      ["Browser and network", "Recent Chrome or Edge. 15 MB to download on first launch, then everything runs locally."],
    ];
    lignes.forEach(([titre, detail], i) => {
      const y = 1.9 + i * 0.8;
      filet(s, MARGE, y, LU, FILET, 0.75, `materiel-filet-${i}`);
      texte(s, titre, { x: MARGE, y: y + 0.12, w: 3.1, h: 0.55, fontFace: SERIF, fontSize: 18, valign: "middle" });
      texte(s, detail, { x: MARGE + 3.3, y: y + 0.12, w: LU - 3.3, h: 0.55, fontSize: 14, color: C.accent4, valign: "middle" });
    });
    filet(s, MARGE, 1.9 + lignes.length * 0.8, LU, FILET, 0.75, "materiel-filet-fin");
    s.addShape(pres.shapes.RECTANGLE, { x: MARGE, y: 6.05, w: LU, h: 0.6, fill: { color: CARTE }, line: { color: FILET, width: 0.75 }, objectName: "cout-materiel" });
    texte(s, "Order of magnitude per entrance: a €50 to €150 webcam and an existing PC are enough for the prototype. No server, no subscription.", {
      x: MARGE + 0.25, y: 6.05, w: LU - 0.5, h: 0.6, fontSize: 13.5, valign: "middle",
    });
    s.addNotes(
      "The main message: measured performance depends as much on the hardware and the installation as on the model. " +
        "The price range is an order of magnitude, not a quote.",
    );
  }

  // 15. Limites commerciales
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Limits" });
    s.addText("LIMITS  ·  COMMERCIAL", { placeholder: "rubrique" });
    s.addText("Commercially, technology is not the main obstacle", { placeholder: "title" });
    const freins = [
      ["Acceptability", "In luxury, discretion comes first. Being recognized without asking can feel like surveillance."],
      ["Real consent", "Service must be just as good without face recognition, or consent is not freely given."],
      ["Costly mistakes", "Showing another client's card exposes their purchases and notes. Rare, but serious."],
      ["Integration", "The value is in the client card, so it has to plug into the existing CRM."],
    ];
    freins.forEach(([titre, detail], i) => {
      const y = 1.9 + i * 1.12;
      texte(s, `0${i + 1}`, { x: MARGE, y: y - 0.03, w: 0.6, h: 0.4, fontFace: CHIFFRES, fontSize: 20, color: OR_TEXTE });
      texte(s, titre, { x: MARGE + 0.65, y, w: 5.2, h: 0.35, fontFace: SANS_FORT, fontSize: 16 });
      texte(s, detail, { x: MARGE + 0.65, y: y + 0.37, w: 5.2, h: 0.65, fontSize: 13, color: C.accent4 });
    });
    const x = 7.25, lw = W - MARGE - x;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.85, w: lw, h: 4.2, fill: { color: CARTE }, line: { color: FILET, width: 0.75 }, objectName: "positionnement" });
    texte(s, "A realistic positioning", { x: x + 0.35, y: 2.1, w: lw - 0.7, h: 0.5, fontFace: SERIF, fontSize: 22 });
    const points = [
      "An opt-in program for loyal clients who ask for it, never on by default.",
      "The advisor stays in control: a Hide card button, no automatic action.",
      "A face-free alternative: loyalty card or app.",
      "Success metric: the share of invited clients who opt in, and their satisfaction.",
    ];
    texte(s, points.map((p, i) => ({ text: p, options: { bullet: { indent: 16 }, breakLine: i < points.length - 1, paraSpaceAfter: 18 } })), {
      x: x + 0.35, y: 2.85, w: lw - 0.7, h: 3.0, fontSize: 15,
    });
    s.addNotes(
      "The prototype shows the technology is within reach: a few hundred euros of hardware and a browser. " +
        "The real business question is whether clients accept it, and a legal framework that requires a genuine choice.",
    );
  }

  // ===== Takeaways =====
  pres.addSection({ title: "Takeaways" });

  // 16. Ce que montre le projet
  {
    const s = diapositive({ masterName: "PAPIER", sectionTitle: "Takeaways" });
    s.addText("TAKEAWAYS", { placeholder: "rubrique" });
    s.addText("What this project says about AI today", { placeholder: "title" });
    const colonnes = [
      ["Already good at", C.accent2, [
        "Recognizing a known face in a fraction of a second, on an ordinary PC.",
        "Running without a server, in a plain browser, with 15 MB of models.",
        "Staying stable in dim light or with a compressed image.",
      ]],
      ["Still hard", C.accent5, [
        "Real conditions: distance, blur, covered or turned faces.",
        "Spoofing, fairness across profiles, evaluation at scale.",
        "The framework: consent, biometrics law, client acceptance.",
      ]],
    ];
    const lc = (LU - 0.8) / 2;
    colonnes.forEach(([titre, couleur, points], i) => {
      const x = MARGE + i * (lc + 0.8);
      s.addShape(pres.shapes.RECTANGLE, { x, y: 1.9, w: 0.6, h: 0.05, fill: { color: couleur }, line: { color: couleur, width: 0 }, objectName: `colonne-trait-${i}` });
      texte(s, titre, { x, y: 2.05, w: lc, h: 0.5, fontFace: SERIF, fontSize: 22 });
      texte(s, points.map((p, j) => ({ text: p, options: { bullet: { indent: 16 }, breakLine: j < points.length - 1, paraSpaceAfter: 10 } })), {
        x, y: 2.7, w: lc, h: 2.3, fontSize: 14.5,
      });
    });
    filet(s, MARGE, 5.4, LU, C.accent1, 0.75, "filet-competences");
    libelle(s, "SKILLS WE USED", MARGE, 5.55, 5);
    texte(s, "Product framing   ·   On-device AI   ·   Measurement and KPIs   ·   Digital law   ·   Software quality", {
      x: MARGE, y: 5.9, w: LU, h: 0.5, fontFace: SERIF, fontSize: 19, italic: true,
    });
    s.addNotes(
      "The message to remember: face recognition has become technically accessible, which makes the questions of framework all the more important. " +
        "The project made us work on measurement, law and product as much as on AI.",
    );
  }

  // 17. Conclusion
  {
    const s = diapositive({ masterName: "COUVERTURE", sectionTitle: "Takeaways" });
    s.addText("NEXT STEPS", { placeholder: "rubrique" });
    s.addText("It works. Now it needs a framework.", { placeholder: "title" });
    const etapes = [
      "Test with a volunteer panel, in a real boutique, over several days.",
      "Add spoofing detection and switch to commercially licensed models.",
      "Run the impact assessment and design the client opt-in journey.",
    ];
    etapes.forEach((t, i) => {
      const y = 4.3 + i * 0.55;
      texte(s, String(i + 1), { x: MARGE, y: y - 0.04, w: 0.4, h: 0.42, fontFace: CHIFFRES, fontSize: 20, color: OR_NUIT });
      texte(s, t, { x: MARGE + 0.45, y, w: 7.4, h: 0.42, fontSize: 15, color: PAPIER_NUIT });
    });
    texte(s, [
      { text: "Thank you.   ", options: { fontFace: SERIF, italic: true, color: PAPIER_NUIT } },
      { text: "Demo  mathos34.github.io/reconnaissance-equipe   ·   Code  github.com/Mathos34/reconnaissance-equipe", options: { color: OR_NUIT } },
    ], { x: MARGE, y: 6.2, w: 9.0, h: 0.35, fontSize: 12 });
    texte(s, EQUIPE.join("   ·   "), { x: MARGE, y: 6.6, w: 9.0, h: 0.3, fontSize: 11, color: DISCRET_NUIT });
    const xq = 10.25, yq = 3.95, cq = 2.0;
    s.addShape(pres.shapes.RECTANGLE, { x: xq, y: yq, w: cq, h: cq, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, objectName: "qr-fond-fin" });
    s.addImage({ data: qr, x: xq + 0.1, y: yq + 0.1, w: cq - 0.2, h: cq - 0.2, objectName: "qr-fin", altText: "QR code to the live demo" });
    cadre(s, xq - 0.18, yq - 0.18, cq + 0.36, cq + 0.36, { etiquette: "Try it", nom: "cadre-qr-fin" });
    s.addNotes("Close on the balance: technically feasible today, but a real deployment first needs a framework. Open the floor to questions.");
  }

  await pres.writeFile({ fileName: SORTIE });
  if (SKILL_THEME) {
    const { applyTheme } = require(SKILL_THEME);
    await applyTheme(SORTIE, THEME);
  }
  console.log(`Deck written: ${SORTIE}`);
  console.log(`Demo: ${nomDemo} (${en(demo.tot)} ms, delay ${en(demo.delai)} ms). Default: ${en(defaut.tot)} ms. Reliable range ${distanceFiable} m, FAR ${auSeuil.far}%`);
}

construire().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
