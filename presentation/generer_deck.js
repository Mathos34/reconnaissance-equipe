// Génère la présentation Maison Test (PowerPoint) à partir des mesures du projet.
// Données : evaluation/resultats/navigateur.json et robustesse.json, captures dans presentation/images/.
// Usage (depuis presentation/) : npm run deck

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const QRCode = require("qrcode");
const fa = require("react-icons/fa6");

const RACINE = path.resolve(__dirname, "..");
const IMAGES = path.join(__dirname, "images");
const SORTIE = path.join(__dirname, "Maison-Test-reconnaissance-client.pptx");
const URL_DEMO = "https://mathos34.github.io/reconnaissance-equipe/";
const URL_DEPOT = "https://github.com/Mathos34/reconnaissance-equipe";
const SKILL_THEME = process.env.APPLY_THEME;

// ---------- données mesurées ----------

const nav = JSON.parse(fs.readFileSync(path.join(RACINE, "evaluation/resultats/navigateur.json"), "utf8"));
const rob = JSON.parse(fs.readFileSync(path.join(RACINE, "evaluation/resultats/robustesse.json"), "utf8"));

const mediane = (valeurs) => {
  const v = valeurs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fr = (v, d = 0) => (v === null || v === undefined ? "-" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const frCourt = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }); // 0,15 et non 0,2

// Typographie française : espace insécable avant les unités, dans les guillemets et avant « : ; ? ! ».
const insecables = (t) =>
  t
    .replace(/(\d) (%|ms|s|m|px|Mo|€|min|h)(?!\p{L})/gu, "$1 $2")
    .replace(/« /g, "« ")
    .replace(/ »/g, " »")
    .replace(/ ([:;?!])/g, " $1");
const typographier = (contenu) =>
  typeof contenu === "string" ? insecables(contenu) : contenu.map((run) => ({ ...run, text: insecables(run.text) }));

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
const M = { wasm: moteur("wasm"), webgpu: moteur("webgpu"), hybride: moteur("hybride") ?? moteur("auto") };
// Mesures avec le GPU dédié (RTX 3060) activé pour le navigateur, si elles existent.
const fichierGpu = path.join(RACINE, "evaluation/resultats/navigateur_gpu_dedie.json");
const navGpu = fs.existsSync(fichierGpu) ? JSON.parse(fs.readFileSync(fichierGpu, "utf8")) : null;
const MG = navGpu ? { webgpu: moteur("webgpu", navGpu), hybride: moteur("hybride", navGpu) ?? moteur("auto", navGpu) } : {};
const defaut = M.wasm; // moteur par défaut du site (docs/DECISIONS.md, D-037)
// Réglage du PC de démo : hybride sur GPU dédié s'il a été mesuré plus rapide, sinon le défaut.
const demo = MG.hybride && MG.hybride.tot < defaut.tot ? MG.hybride : defaut;
const nomDemo = demo === MG.hybride ? "hybride, GPU dédié" : "processeur (WASM)";
const enrolement = nav.enrolements[nav.enrolements.length - 1];
const inconnus = nav.inconnu ?? [];
const faussesInconnus = inconnus.reduce((t, s) => t + s.pistesReconnues, 0);
const similariteInconnu = mediane(inconnus.map((s) => s.scores.moyenne));

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

// ---------- thème ----------

const THEME = {
  name: "Maison Test",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1E1A17", // encre
    lt1: "FFFFFF",
    dk2: "1F2433", // fond sombre des diapositives d'ouverture et de conclusion
    lt2: "F4F0E8", // teinte des cartes
    accent1: "B07A27", // or, couleur dominante
    accent2: "2A78D6", // séries de graphiques (palette validée pour les daltoniens)
    accent3: "1BAF7A",
    accent4: "6E645B", // texte discret
    accent5: "A8412F", // limites, alertes
    accent6: "2F6E46", // atouts
    hlink: "2A78D6",
    folHlink: "6E645B",
  },
};
const H = THEME.colors; // couleurs en hexadécimal, pour les options qui n'acceptent pas les couleurs de thème
const SERIES = ["2A78D6", "C08A32", "1BAF7A"]; // validée : bleu, or, vert d'eau

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13,33 x 7,5 pouces
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Maison Test : reconnaître un client en moins d'une seconde";
pres.subject = "POC de reconnaissance client dans le navigateur, projet de cours Audencia";
pres.author = "Équipe projet Maison Test";
const C = pres.SchemeColor;

const W = 13.333;
const MARGE = 0.6;
const LARGEUR_UTILE = W - 2 * MARGE;

// ---------- gabarits ----------

pres.defineSlideMaster({
  title: "OUVERTURE",
  background: { color: H.dk2 },
  objects: [
    { placeholder: { options: { name: "surtitre", type: "body", x: MARGE, y: 1.3, w: 10, h: 0.4, fontFace: "Calibri", fontSize: 14, bold: true, color: C.accent1, charSpacing: 2, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MARGE, y: 1.8, w: 11.5, h: 1.9, fontFace: "Cambria", fontSize: 44, color: C.background1, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MARGE, y: 3.85, w: 10.5, h: 1.0, fontFace: "Calibri", fontSize: 20, color: "D9D4CA", valign: "top", margin: 0 }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "CONTENU",
  background: { color: H.lt1 },
  margin: [0.5, MARGE, 0.6, MARGE],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MARGE, y: 0.35, w: LARGEUR_UTILE, h: 0.95, fontFace: "Cambria", fontSize: 30, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Maison Test  ·  POC de reconnaissance client  ·  Audencia 2026", options: { x: MARGE, y: 7.02, w: 8, h: 0.3, fontFace: "Calibri", fontSize: 10, color: C.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 12.15, y: 7.02, w: 0.6, h: 0.3, fontFace: "Calibri", fontSize: 10, color: H.accent4, align: "right" },
});

// ---------- éléments graphiques ----------

/** Nouvelle diapositive dont tous les textes passent par la typographie française. */
function diapositive(options) {
  const slide = pres.addSlide(options);
  const ajouter = slide.addText.bind(slide);
  slide.addText = (contenu, opts) => ajouter(typographier(contenu), opts);
  return slide;
}

async function icone(Composant, couleur) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Composant, { size: 256, color: `#${couleur}` }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `image/png;base64,${png.toString("base64")}`;
}

/** Motif du deck : une icône dans un cercle teinté. */
function pastille(slide, image, x, y, d = 0.62, { fond = C.background2, nom = "pastille" } = {}) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fond }, line: { color: fond, width: 0 }, objectName: `${nom}-cercle` });
  const marge = d * 0.24;
  slide.addImage({ data: image, x: x + marge, y: y + marge, w: d - 2 * marge, h: d - 2 * marge, objectName: `${nom}-icone`, altText: "" });
}

function carte(slide, x, y, w, h, nom) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: nom,
  });
}

function texte(slide, contenu, options) {
  slide.addText(contenu, { isTextBox: true, fontFace: "Calibri", color: C.text1, margin: 0, valign: "top", ...options });
}

/** Grand chiffre et son libellé (tuile de KPI). */
function tuile(slide, x, y, w, h, valeur, libelle, detail, nom) {
  carte(slide, x, y, w, h, nom);
  texte(slide, valeur, { x: x + 0.25, y: y + 0.22, w: w - 0.5, h: 0.75, fontFace: "Cambria", fontSize: 34, color: C.accent1, valign: "middle", objectName: `${nom}-valeur` });
  texte(slide, libelle, { x: x + 0.25, y: y + 1.0, w: w - 0.5, h: 0.4, fontSize: 15, bold: true, objectName: `${nom}-libelle` });
  texte(slide, detail, { x: x + 0.25, y: y + 1.38, w: w - 0.5, h: h - 1.5, fontSize: 12, color: C.accent4, objectName: `${nom}-detail` });
}

function capture(slide, fichier, x, y, w, nom, alt) {
  const chemin = path.join(IMAGES, fichier);
  if (!fs.existsSync(chemin)) {
    carte(slide, x, y, w, (w * 9) / 16, nom);
    texte(slide, `Capture manquante : ${fichier}`, { x, y: y + 0.2, w, h: 0.4, align: "center", color: C.accent4 });
    return;
  }
  slide.addImage({ path: chemin, x, y, w, h: (w * 9) / 16, objectName: nom, altText: alt, rounding: false, shadow: { type: "outer", blur: 6, offset: 2, angle: 90, opacity: 0.18, color: "000000" } });
}

const axes = () => ({
  catAxisLabelColor: H.accent4,
  valAxisLabelColor: H.accent4,
  catAxisLabelFontFace: "+mn-lt",
  valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 11,
  valAxisLabelFontSize: 11,
  valGridLine: { color: "E6E1D8", size: 0.75 },
  catGridLine: { style: "none" },
  catAxisLineColor: "C9C2B6",
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
});

// ---------- construction ----------

async function construire() {
  const I = {
    camera: await icone(fa.FaCamera, H.accent1),
    fiche: await icone(fa.FaAddressCard, H.accent1),
    tasse: await icone(fa.FaMugHot, H.accent1),
    horloge: await icone(fa.FaClock, H.accent1),
    graphique: await icone(fa.FaChartLine, H.accent1),
    navigateur: await icone(fa.FaWindowMaximize, H.accent1),
    cadenas: await icone(fa.FaLock, H.accent1),
    puce: await icone(fa.FaMicrochip, H.accent1),
    loi: await icone(fa.FaScaleBalanced, H.accent1),
    boutique: await icone(fa.FaBagShopping, H.accent1),
    utilisateurs: await icone(fa.FaUserCheck, H.accent1),
    eclair: await icone(fa.FaBolt, H.accent1),
    bouclier: await icone(fa.FaShieldHalved, H.accent1),
    ampoule: await icone(fa.FaLightbulb, H.accent1),
    alerte: await icone(fa.FaTriangleExclamation, H.accent5),
    valide: await icone(fa.FaCircleCheck, H.accent6),
    jouer: await icone(fa.FaPlay, H.dk2),
    code: await icone(fa.FaCode, H.accent1),
    base: await icone(fa.FaDatabase, H.accent1),
    globe: await icone(fa.FaGlobe, H.accent1),
  };
  const qr = `image/png;base64,${(await QRCode.toBuffer(URL_DEMO, { margin: 1, width: 600, color: { dark: `#${H.dk1}`, light: "#FFFFFF" } })).toString("base64")}`;

  // ===== Section 1 : le projet =====
  pres.addSection({ title: "Le projet" });

  // 1. Ouverture
  {
    const s = diapositive({ masterName: "OUVERTURE", sectionTitle: "Le projet" });
    s.addText("PROJET DE COURS  ·  AUDENCIA  ·  2026", { placeholder: "surtitre" });
    s.addText("Reconnaître un client en moins d'une seconde", { placeholder: "title" });
    s.addText("Maison Test : un prototype de reconnaissance client qui tourne entièrement dans le navigateur", { placeholder: "body" });
    texte(s, "Équipe : à compléter", { x: MARGE, y: 5.75, w: 7, h: 0.4, fontSize: 16, color: "D9D4CA", objectName: "equipe" });
    texte(s, "Démo en ligne : mathos34.github.io/reconnaissance-equipe", { x: MARGE, y: 6.2, w: 8, h: 0.4, fontSize: 14, color: C.accent1, objectName: "lien-demo" });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 10.85, y: 4.95, w: 1.9, h: 1.9, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, objectName: "qr-fond" });
    s.addImage({ data: qr, x: 10.95, y: 5.05, w: 1.7, h: 1.7, objectName: "qr-demo", altText: "QR code vers la démo en ligne" });
    s.addNotes(
      "Accroche : en boutique de luxe, l'accueil se joue dans les premières secondes. " +
        "Nous avons construit un prototype qui reconnaît un client enregistré et affiche sa fiche au conseiller. " +
        "Le QR code ouvre la démo en ligne : tout le monde peut la tester sur son téléphone ou son ordinateur. " +
        "Plan : le projet, les résultats chiffrés, une démo de 4 minutes, puis les limites, qui sont la partie la plus intéressante.",
    );
  }

  // 2. Le besoin
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Le projet" });
    s.addText("Le luxe se joue dans les premières secondes de l'accueil", { placeholder: "title" });
    carte(s, MARGE, 1.65, 5.9, 4.6, "citation");
    texte(s, "Ce que voit le conseiller", { x: MARGE + 0.4, y: 1.95, w: 5.1, h: 0.4, fontSize: 14, bold: true, color: C.accent1 });
    texte(s, "« Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ? »", { x: MARGE + 0.4, y: 2.45, w: 5.1, h: 2.2, fontFace: "Cambria", fontSize: 30, italic: true, color: C.text1 });
    texte(s, "Phrase d'accueil générée par l'application à partir de la fiche et de l'heure.", { x: MARGE + 0.4, y: 5.3, w: 5.1, h: 0.7, fontSize: 13, color: C.accent4 });

    const lignes = [
      [I.utilisateurs, "Reconnaître sans demander le nom", "Le client enregistré est identifié dès son entrée dans le champ de la caméra."],
      [I.tasse, "Se souvenir de ses préférences", "Boisson, sucre, lait, style, derniers achats, notes du conseiller."],
      [I.horloge, "Adapter l'accueil au moment", "La suggestion change avant et après 12 h, avec un rappel de la dernière visite."],
    ];
    lignes.forEach(([img, titre, detail], i) => {
      const y = 1.75 + i * 1.45;
      pastille(s, img, 7.0, y, 0.7, { nom: `besoin-${i}` });
      texte(s, titre, { x: 7.95, y: y - 0.02, w: 4.8, h: 0.4, fontSize: 18, bold: true });
      texte(s, detail, { x: 7.95, y: y + 0.42, w: 4.8, h: 0.8, fontSize: 14, color: C.accent4 });
    });
    texte(s, "Notre question : jusqu'où une IA peut-elle aider le conseiller, et avec quelles limites ?", { x: 7.0, y: 6.05, w: 5.75, h: 0.6, fontSize: 15, italic: true, color: C.accent1 });
    s.addNotes(
      "Le scénario : une boutique fictive, Maison Test. Les clients sont des membres de l'équipe avec des fiches inventées. " +
        "L'objectif n'est pas de vendre un produit mais de tester un concept : est-ce faisable, à quelle vitesse, et qu'est-ce qui coince ?",
    );
  }

  // 3. Ce que nous avons construit
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Le projet" });
    s.addText("Une application complète, publiée et utilisable par lien", { placeholder: "title" });
    const blocs = [
      [I.camera, "Reconnaissance en direct", "Cadre et nom sur chaque visage, « Inconnu » sinon. Fiche et suggestion d'accueil affichées à droite."],
      [I.fiche, "Gestion des clients", "Consentement « J'ACCEPTE », capture guidée de 25 images en 5 poses, fiche complète, export et import."],
      [I.graphique, "Indicateurs intégrés", "L'application mesure elle-même sa vitesse, ses délais et la qualité de l'enrôlement."],
    ];
    blocs.forEach(([img, titre, detail], i) => {
      const y = 1.65 + i * 1.6;
      carte(s, MARGE, y, 5.2, 1.4, `bloc-${i}`);
      pastille(s, img, MARGE + 0.25, y + 0.35, 0.7, { fond: C.background1, nom: `bloc-${i}` });
      texte(s, titre, { x: MARGE + 1.15, y: y + 0.18, w: 3.9, h: 0.4, fontSize: 17, bold: true });
      texte(s, detail, { x: MARGE + 1.15, y: y + 0.58, w: 3.9, h: 0.8, fontSize: 13, color: C.accent4 });
    });
    capture(s, "reconnaissance.png", 6.25, 1.75, 6.5, "capture-reconnaissance", "Page Reconnaissance : visage encadré avec le nom de la cliente, fiche et suggestion d'accueil à droite");
    texte(s, "Page Reconnaissance (visage pixélisé pour la publication).", { x: 6.25, y: 5.55, w: 6.5, h: 0.35, fontSize: 11, color: C.accent4 });
    s.addNotes(
      "Trois pages : Reconnaissance pour le conseiller, Clients pour l'inscription, Indicateurs pour le suivi. " +
        "Le site est publié sur GitHub Pages : aucun serveur, aucune installation. Les visages des captures sont pixélisés.",
    );
  }

  // 4. Architecture
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Le projet" });
    s.addText("Sans serveur : toute l'IA tourne dans le navigateur", { placeholder: "title" });
    const etapes = [
      ["Caméra", "1 image sur 3 analysée"],
      ["Détection", "SCRFD, 2,4 Mo"],
      ["Reconnaissance", "MobileFaceNet, 13 Mo"],
      ["Suivi et lissage", "3 décisions sur 5"],
      ["Fiche", "suggestion selon l'heure"],
    ];
    const largeur = 2.05;
    const ecart = (LARGEUR_UTILE - etapes.length * largeur) / (etapes.length - 1);
    etapes.forEach(([titre, detail], i) => {
      const x = MARGE + i * (largeur + ecart);
      carte(s, x, 1.85, largeur, 1.35, `etape-${i}`);
      texte(s, titre, { x: x + 0.15, y: 2.02, w: largeur - 0.3, h: 0.45, fontSize: 16, bold: true, align: "center" });
      texte(s, detail, { x: x + 0.15, y: 2.5, w: largeur - 0.3, h: 0.55, fontSize: 13, color: C.accent4, align: "center" });
      if (i < etapes.length - 1) {
        s.addShape(pres.shapes.LINE, { x: x + largeur + 0.05, y: 2.52, w: ecart - 0.1, h: 0, line: { color: C.accent1, width: 1.75, endArrowType: "triangle" }, objectName: `fleche-${i}` });
      }
    });
    const faits = [
      [I.cadenas, "Aucune image envoyée", "Les photos restent sur l'appareil. Seul un gabarit de 512 nombres est conservé, après consentement."],
      [I.navigateur, `${fr(POIDS_MO, 1)} Mo de modèles`, "Téléchargés une fois, puis gardés par le navigateur. ONNX Runtime Web, WebGPU et WASM."],
      [I.globe, "Publié sur GitHub Pages", "Un site statique, une base dans le navigateur, export et import en JSON."],
    ];
    faits.forEach(([img, titre, detail], i) => {
      const x = MARGE + i * 4.15;
      pastille(s, img, x, 3.85, 0.7, { nom: `fait-${i}` });
      texte(s, titre, { x: x + 0.9, y: 3.85, w: 3.05, h: 0.4, fontSize: 17, bold: true });
      texte(s, detail, { x: x + 0.9, y: 4.28, w: 3.05, h: 1.3, fontSize: 13, color: C.accent4 });
    });
    texte(s, "Mêmes modèles que la version Python (InsightFace buffalo_s), portés en JavaScript et validés : écart de position des visages de 0,17 px, similarité des signatures de 0,9985.", { x: MARGE, y: 5.95, w: LARGEUR_UTILE, h: 0.7, fontSize: 13, italic: true, color: C.accent4 });
    s.addNotes(
      "Point clé technique : rien ne part sur un serveur. Le navigateur télécharge deux modèles, 15 Mo au total, et fait tout le calcul. " +
        "Nous avons d'abord fait une version Python, puis porté la chaîne en JavaScript et vérifié qu'elle donne les mêmes résultats au pixel près.",
    );
  }

  // ===== Section 2 : résultats et KPI =====
  pres.addSection({ title: "Résultats et KPI" });

  // 5. KPI clés
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Résultats et KPI" });
    s.addText("Les chiffres clés, mesurés par l'application elle-même", { placeholder: "title" });
    const tuiles = [
      [`${fr(demo.delai / 1000, 2)} s`, "Délai de reconnaissance", `De l'apparition du visage à la fiche (médiane). ${fr(defaut.delai / 1000, 2)} s sur le seul processeur.`],
      [`${fr(demo.tot)} ms`, "Par analyse", `Détection et reconnaissance, ${nomDemo}. ${fr(defaut.tot)} ms sur le seul processeur.`],
      [`${fr(demo.fps)} img/s`, "Fluidité de l'affichage", `Dont ${fr(demo.analyses, 1)} analyses par seconde, une image sur trois.`],
      [`${fr(enrolement.dureeS, 1)} s`, "Pour enrôler un client", `25 images valides en 5 poses, ${fr(enrolement.tauxValides)} % d'images exploitables.`],
      [`${fr(auSeuil.far)} %`, "Fausses acceptations", `Au seuil 0,35, sur ${rob.identites} identités et ${Object.keys(rob.conditions).length} familles de conditions dégradées.`],
      [`${fr(distanceFiable, 1)} m`, "Distance fiable", `100 % d'identification jusque-là, encore ${fr(tauxUtile)} % à ${fr(distanceUtile, 1)} m (estimation).`],
      [`${fr(PARITE.ecartPx, 2)} px`, "Écart JavaScript et Python", "Mêmes visages et mêmes signatures, à 0,9985 de similarité."],
      [`${TESTS.js + TESTS.python}`, "Tests automatisés", `${TESTS.js} tests du site, ${TESTS.python} de la version Python, plus un test de bout en bout.`],
    ];
    const lw = (LARGEUR_UTILE - 3 * 0.3) / 4;
    tuiles.forEach(([valeur, libelle, detail], i) => {
      const x = MARGE + (i % 4) * (lw + 0.3);
      const y = 1.6 + Math.floor(i / 4) * 2.55;
      tuile(s, x, y, lw, 2.3, valeur, libelle, detail, `kpi-${i}`);
    });
    s.addNotes(
      "Ces chiffres viennent de mesures reproductibles (dossier evaluation/ du dépôt) : performance dans Edge sur un Ryzen 7 5800H avec RTX 3060, robustesse avec les mêmes modèles. " +
        "Les trois premiers chiffres correspondent au réglage de démo (GPU dédié activé, mode hybride) ; le site utilise le processeur par défaut. " +
        "Le délai de reconnaissance tient compte du lissage : il faut trois décisions concordantes avant d'afficher un nom, pour éviter les erreurs.",
    );
  }

  // 6. Optimisation guidée par les KPI
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Résultats et KPI" });
    s.addText("Les KPI ont guidé le choix du moteur de calcul", { placeholder: "title" });
    const lignes = [
      ["Processeur (WASM)", M.wasm],
      ["WebGPU, GPU intégré", M.webgpu],
      ["Hybride, GPU intégré", M.hybride],
      ["WebGPU, RTX 3060", MG.webgpu],
      ["Hybride, RTX 3060", MG.hybride],
    ].filter(([, v]) => v);
    s.addChart(
      pres.charts.BAR,
      [
        { name: "Préparation de l'image", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].pre)) },
        { name: "Détection des visages", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].det)) },
        { name: "Reconnaissance", labels: lignes.map((l) => l[0]), values: lignes.map((l) => Math.round(l[1].emb)) },
      ],
      {
        x: MARGE, y: 1.55, w: 7.7, h: 5.0, barDir: "bar", barGrouping: "stacked", barGapWidthPct: 55,
        chartColors: SERIES, showValue: true, dataLabelPosition: "ctr",
        showLegend: true, legendPos: "b", showTitle: true, title: "Temps par analyse et par étape (ms, médiane de 5 sessions)",
        catAxisOrientation: "maxMin", ...axes(),
      },
    );
    const x = 8.65;
    texte(s, "Ce que les mesures ont montré", { x, y: 1.65, w: 4.1, h: 0.4, fontSize: 16, bold: true, color: C.accent1 });
    const recoGpu = [M.webgpu?.emb, MG.webgpu?.emb].filter(Boolean);
    const constats = [
      `La reconnaissance est 3 à 4 fois plus lente sur carte graphique, quelle qu'elle soit (${fr(Math.min(...recoGpu))} à ${fr(Math.max(...recoGpu))} ms contre ${fr(M.wasm.emb)} ms).`,
      MG.hybride ? `La détection n'accélère qu'avec la carte dédiée (${fr(MG.hybride.det)} ms contre ${fr(M.wasm.det)} ms).` : "La détection n'accélère qu'avec une carte dédiée.",
      MG.hybride ? `Réglage retenu : processeur par défaut, hybride sur le PC de démo, soit ${fr(MG.hybride.tot)} ms par analyse et ${fr(MG.hybride.delai / 1000, 2)} s avant la fiche.` : "Réglage retenu : processeur par défaut.",
    ];
    texte(
      s,
      constats.map((c, i) => ({ text: c, options: { bullet: true, breakLine: i < constats.length - 1, paraSpaceAfter: 10 } })),
      { x, y: 2.15, w: 4.1, h: 3.0, fontSize: 14 },
    );
    carte(s, x, 5.3, 4.1, 1.25, "lecon");
    texte(s, "Sans mesure, nous aurions conclu « le GPU accélère tout ». Le navigateur utilisait en fait le GPU intégré, plus lent que le processeur.", { x: x + 0.22, y: 5.4, w: 3.66, h: 1.08, fontSize: 13, italic: true, valign: "middle" });
    s.addNotes(
      "Une analyse se décompose en trois étapes, mesurées séparément par l'application. " +
        "Première surprise : le navigateur utilisait le GPU intégré du processeur, pas la RTX. Deuxième surprise : même sur la RTX, la reconnaissance est plus lente qu'en WASM, " +
        "sans doute parce que certaines opérations du modèle ne sont pas prises en charge par WebGPU. " +
        "D'où un réglage par défaut prudent (processeur) et un mode hybride pour le PC de démo, après avoir activé la carte dédiée pour Edge dans les paramètres graphiques de Windows.",
    );
  }

  // 7. Distance
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Résultats et KPI" });
    s.addText(`Fiable jusqu'à environ ${fr(distanceFiable, 1)} m de la caméra`, { placeholder: "title" });
    const niveaux = [...taille].sort((a, b) => a.distanceEstimeeM - b.distanceEstimeeM);
    const etiquettes = niveaux.map((n) => `${fr(n.distanceEstimeeM, 1)} m`);
    s.addChart(
      pres.charts.LINE,
      [{ name: "Client bien identifié", labels: etiquettes, values: niveaux.map((n) => n.identification) }],
      {
        x: MARGE, y: 1.55, w: 8.2, h: 4.9, chartColors: [SERIES[0]], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 8,
        valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, valAxisLabelFormatCode: "0\" %\"",
        showLegend: false, showTitle: true, title: "Clients bien identifiés selon la distance estimée visage-caméra",
        ...axes(),
      },
    );
    const x = 9.2;
    texte(s, "Lecture", { x, y: 1.65, w: 3.55, h: 0.4, fontSize: 16, bold: true, color: C.accent1 });
    const lecture = [
      `100 % jusqu'à ${fr(distanceFiable, 1)} m, encore ${fr(tauxUtile)} % à ${fr(distanceUtile, 1)} m.`,
      "Au-delà de 4 m, le visage fait moins de 35 px et n'est plus détecté.",
      ...(limiteParDetection ? ["Tout visage détecté a été bien reconnu : la limite vient de la détection."] : []),
      "Conséquence : placer la caméra près de l'entrée, à hauteur de visage.",
    ];
    texte(
      s,
      lecture.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < lecture.length - 1, paraSpaceAfter: 10 } })),
      { x, y: 2.15, w: 3.55, h: 3.2, fontSize: 15 },
    );
    texte(s, "Distance estimée pour une webcam HD de 70° et un visage de 15 cm. 6 identités, même photo source.", { x, y: 5.4, w: 3.55, h: 1.0, fontSize: 12, color: C.accent4 });
    s.addNotes(
      "Nous avons simulé l'éloignement en réduisant la taille du visage dans une image HD. La conversion en mètres est une estimation géométrique. " +
        "Le message pour un magasin : la caméra doit être bien placée, la distance utile est d'environ 2 mètres.",
    );
  }

  // 8. Robustesse
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Résultats et KPI" });
    s.addText("Robuste à la lumière, fragile au flou fort et au visage masqué", { placeholder: "title" });
    const grille = [
      ["luminosite", "Exposition (×)", frCourt],
      ["flou", "Flou (px)", (v) => fr(v)],
      ["rotation", "Inclinaison (°)", (v) => fr(v)],
      ["occultation", "Bas du visage masqué (%)", (v) => fr(v * 100)],
      ["bruit", "Bruit du capteur", (v) => fr(v)],
      ["compression", "Qualité JPEG", (v) => fr(v)],
    ];
    const cw = (LARGEUR_UTILE - 2 * 0.35) / 3;
    const ch = 2.45;
    grille.forEach(([cle, titre, format], i) => {
      const niveaux = rob.conditions[cle].niveaux;
      const x = MARGE + (i % 3) * (cw + 0.35);
      const y = 1.5 + Math.floor(i / 3) * (ch + 0.15);
      s.addChart(
        pres.charts.LINE,
        [{ name: "Client bien identifié", labels: niveaux.map((n) => format(n.niveau)), values: niveaux.map((n) => n.identification) }],
        {
          x, y, w: cw, h: ch, chartColors: [SERIES[0]], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 6,
          valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 50, valAxisLabelFormatCode: "0\" %\"",
          showLegend: false, showTitle: true, title: titre, ...axes(), catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
        },
      );
    });
    texte(s, `Taux d'identification correcte au seuil 0,35, ${rob.identites} identités, un point par niveau. La dégradation augmente vers la droite, sauf pour l'exposition : 1 = normale, plus sombre à gauche, plus claire à droite.`, { x: MARGE, y: 6.6, w: LARGEUR_UTILE, h: 0.4, fontSize: 11, color: C.accent4 });
    s.addNotes(
      "Six familles de dégradations, du léger au très fort. Le modèle tient très bien la lumière faible ou forte et la compression. " +
        "Il décroche avec un flou important, une tête inclinée à 90 degrés, ou quand plus de la moitié du visage est masquée. " +
        "Attention : enrôlement et test partent de la même photo, la réalité sera moins favorable.",
    );
  }

  // 9. Seuil
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Résultats et KPI" });
    s.addText(`Au seuil 0,35 : ${fr(auSeuil.far)} % de fausses acceptations, ${fr(auSeuil.frr, 1)} % de refus`, { placeholder: "title" });
    // Histogramme regroupé par pas de 0,1, en part de chaque population (les imposteurs sont 5 fois plus nombreux).
    const regrouper = (h) => {
      const total = h.reduce((t, c) => t + c.n, 0);
      const classes = [];
      for (let i = 0; i < h.length; i += 2) classes.push({ debut: h[i].debut, part: (100 * (h[i].n + (h[i + 1]?.n ?? 0))) / total });
      return classes;
    };
    const meme = regrouper(rob.distributions.memePersonne.histogramme);
    const imp = regrouper(rob.distributions.imposteurs.histogramme);
    const etiquettes = meme.map((c) => fr(c.debut, 1));
    s.addChart(
      pres.charts.BAR,
      [
        { name: "Même personne", labels: etiquettes, values: meme.map((c) => +c.part.toFixed(1)) },
        { name: "Autre personne", labels: etiquettes, values: imp.map((c) => +c.part.toFixed(1)) },
      ],
      {
        x: MARGE, y: 1.55, w: 6.1, h: 4.7, barDir: "col", barGrouping: "clustered", barGapWidthPct: 40,
        chartColors: [SERIES[0], SERIES[1]], showLegend: true, legendPos: "b", showTitle: true,
        title: "Similarité visage-gabarit (part des comparaisons)", valAxisLabelFormatCode: "0\" %\"", ...axes(),
      },
    );
    const seuils = rob.courbe.filter((c) => Math.round(c.seuil * 100) % 5 === 0 && c.seuil <= 0.8);
    s.addChart(
      pres.charts.LINE,
      [
        { name: "Fausses acceptations (FAR)", labels: seuils.map((c) => fr(c.seuil, 2)), values: seuils.map((c) => c.far) },
        { name: "Refus à tort (FRR)", labels: seuils.map((c) => fr(c.seuil, 2)), values: seuils.map((c) => c.frr) },
      ],
      {
        x: 6.95, y: 1.55, w: 5.8, h: 3.7, chartColors: [SERIES[1], SERIES[0]], lineSize: 2, lineDataSymbol: "none",
        valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelFormatCode: "0\" %\"", showLegend: true, legendPos: "b",
        showTitle: true, title: "Taux d'erreur selon le seuil choisi", ...axes(), catAxisLabelFrequency: 2,
      },
    );
    texte(
      s,
      `Les deux groupes sont bien séparés : les autres personnes restent sous ${fr(rob.distributions.imposteurs.max, 2)} de similarité. Le seuil 0,35 privilégie l'absence de fausse fiche : mieux vaut un « Inconnu » qu'une erreur de nom.`,
      { x: 6.95, y: 5.4, w: 5.8, h: 1.0, fontSize: 13 },
    );
    texte(s, `Évaluation indicative : ${rob.identites} identités, même photo source pour l'enrôlement et le test, conditions dégradées cumulées.`, { x: MARGE, y: 6.4, w: 6.1, h: 0.45, fontSize: 11, color: C.accent4 });
    s.addNotes(
      "Le seuil règle le compromis : trop bas, on affiche la fiche de quelqu'un d'autre ; trop haut, on ne reconnaît plus les clients. " +
        "Dans le luxe, afficher le mauvais nom est pire que ne rien afficher, d'où un seuil prudent. " +
        `Les ${fr(auSeuil.frr, 1)} % de refus viennent surtout des conditions extrêmes (flou fort, visage masqué).`,
    );
  }

  // ===== Section 3 : démonstration =====
  pres.addSection({ title: "Démonstration" });

  // 10. Déroulé de la démo
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Démonstration" });
    s.addText("Démo : de l'inscription à l'accueil en 4 minutes", { placeholder: "title" });
    const etapes = [
      ["1", "Inscrire un client", "Page Clients : taper J'ACCEPTE, capturer 25 images en suivant les 5 poses.", "1 min 15"],
      ["2", "Remplir sa fiche", "Boisson, sucre, lait, style, derniers achats, prochain rendez-vous.", "1 min"],
      ["3", "Le reconnaître", "Page Reconnaissance : la personne entre dans le champ, sa fiche s'affiche. Un autre membre reste « Inconnu ».", "1 min"],
      ["4", "Lire les indicateurs", "Page Indicateurs : délai de reconnaissance, temps par étape, enrôlement.", "45 s"],
    ];
    etapes.forEach(([n, titre, detail, duree], i) => {
      const y = 1.6 + i * 1.18;
      s.addShape(pres.shapes.OVAL, { x: MARGE, y, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: `demo-numero-${n}` });
      texte(s, n, { x: MARGE, y, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle" });
      texte(s, titre, { x: MARGE + 0.85, y: y - 0.04, w: 5.6, h: 0.4, fontSize: 17, bold: true });
      texte(s, detail, { x: MARGE + 0.85, y: y + 0.36, w: 5.6, h: 0.7, fontSize: 13, color: C.accent4 });
      texte(s, duree, { x: 7.15, y: y + 0.05, w: 1.0, h: 0.4, fontSize: 14, bold: true, color: C.accent1, align: "right" });
    });
    carte(s, 8.55, 1.55, 4.2, 4.85, "plan-b");
    texte(s, "À tester en direct", { x: 8.85, y: 1.75, w: 3.6, h: 0.4, fontSize: 16, bold: true, color: C.accent1 });
    s.addShape(pres.shapes.RECTANGLE, { x: 9.65, y: 2.25, w: 2.0, h: 2.0, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, objectName: "qr-fond-demo" });
    s.addImage({ data: qr, x: 9.75, y: 2.35, w: 1.8, h: 1.8, objectName: "qr-demo-2", altText: "QR code vers la démo en ligne" });
    texte(s, "Plan B si la démo coince", { x: 8.85, y: 4.45, w: 3.6, h: 0.35, fontSize: 14, bold: true });
    texte(
      s,
      [
        { text: "Retirer ?moteur=hybride de l'adresse : retour au processeur.", options: { bullet: true, breakLine: true } },
        { text: "Importer la sauvegarde JSON préparée.", options: { bullet: true, breakLine: true } },
        { text: "Diapositive suivante : le parcours en images.", options: { bullet: true } },
      ],
      { x: 8.85, y: 4.85, w: 3.65, h: 1.4, fontSize: 13 },
    );
    s.addNotes(
      "Avant la séance : dans Windows, Paramètres, Affichage, Graphiques, régler Microsoft Edge sur Hautes performances (RTX 3060). " +
        "Ouvrir index.html?moteur=hybride sur l'ordinateur de démo, autoriser la caméra, vérifier la lumière face à la personne, " +
        "et charger une première fois les modèles (15 Mo) pour éviter l'attente. Garder un export JSON avec un client déjà enrôlé. " +
        "Pendant la démo, montrer aussi le bouton Masquer la fiche, et faire entrer une personne non enregistrée pour montrer « Inconnu ».",
    );
  }

  // 11. Parcours en images
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Démonstration" });
    s.addText("Le parcours en images", { placeholder: "title" });
    const vues = [
      ["capture.png", "1. Consentement, puis capture guidée en 5 poses", "Page Clients en cours de capture"],
      ["fiche.png", "2. Fiche : préférences, achats, rendez-vous", "Formulaire de fiche client"],
      ["indicateurs.png", "3. Indicateurs mesurés pendant la démo", "Tableau de bord des indicateurs"],
    ];
    // Une grande vue (l'enrôlement, le moment clé) et deux vues empilées à droite.
    const ecart = 0.35;
    const petite = 3.95;
    const grande = LARGEUR_UTILE - petite - ecart;
    const [principale, ...autres] = vues;
    capture(s, principale[0], MARGE, 1.5, grande, "vue-0", principale[2]);
    texte(s, principale[1], { x: MARGE, y: 1.5 + (grande * 9) / 16 + 0.12, w: grande, h: 0.35, fontSize: 14, bold: true });
    texte(s, "La reconnaissance elle-même est en diapositive 3. Captures réalisées avec une caméra simulée, visages pixélisés.", { x: MARGE, y: 6.42, w: grande, h: 0.3, fontSize: 11, color: C.accent4 });
    autres.forEach(([fichier, legende, alt], i) => {
      const x = MARGE + grande + ecart;
      const y = 1.5 + i * 2.65;
      capture(s, fichier, x, y, petite, `vue-${i + 1}`, alt);
      texte(s, legende, { x, y: y + (petite * 9) / 16 + 0.1, w: petite, h: 0.3, fontSize: 13, bold: true });
    });
    s.addNotes("Diapositive de secours : si la caméra ou le réseau font défaut, dérouler le parcours à partir de ces captures.");
  }

  // ===== Section 4 : limites =====
  pres.addSection({ title: "Limites" });

  // 12. Limites techniques
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Limites" });
    s.addText("Limites techniques et pistes d'amélioration", { placeholder: "title" });
    const lignes = [
      ["Évaluation sur 6 identités et une seule photo par personne", "Tester sur un panel volontaire, plusieurs jours, lunettes, coiffures"],
      ["Aucune détection de fraude (photo d'une photo)", "Ajouter une détection de vivacité (clignement, profondeur)"],
      ["Base stockée dans un seul navigateur", "Base partagée et chiffrée entre les postes de la boutique"],
      ["Poses guidées mais non vérifiées à l'enrôlement", "Contrôler l'angle de la tête à partir des points du visage"],
      [`${fr(defaut.tot)} ms par analyse, calcul sur un seul cœur`, "Activer le multicœur (en-têtes du site) et un modèle optimisé"],
      [`Distance utile d'environ ${fr(distanceFiable, 0)} m, sensible au flou`, "Caméra mieux placée, plus résolue, éclairage de face"],
    ];
    texte(s, "Limite constatée", { x: MARGE, y: 1.55, w: 5.9, h: 0.4, fontSize: 15, bold: true, color: C.accent5 });
    texte(s, "Amélioration possible", { x: 6.85, y: 1.55, w: 5.9, h: 0.4, fontSize: 15, bold: true, color: C.accent6 });
    lignes.forEach(([limite, piste], i) => {
      const y = 2.05 + i * 0.78;
      carte(s, MARGE, y, LARGEUR_UTILE, 0.66, `limite-${i}`);
      texte(s, limite, { x: MARGE + 0.25, y: y + 0.1, w: 5.6, h: 0.5, fontSize: 14, valign: "middle" });
      s.addShape(pres.shapes.LINE, { x: 6.25, y: y + 0.33, w: 0.45, h: 0, line: { color: C.accent1, width: 1.5, endArrowType: "triangle" }, objectName: `limite-fleche-${i}` });
      texte(s, piste, { x: 6.85, y: y + 0.1, w: 5.75, h: 0.5, fontSize: 14, valign: "middle", color: C.text1 });
    });
    s.addNotes(
      "Nous préférons être transparents : un POC montre la faisabilité, pas la fiabilité en conditions réelles. " +
        "La première limite est la plus importante : notre évaluation est petite et optimiste. La deuxième est un vrai risque en production.",
    );
  }

  // 13. Limites légales
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Limites" });
    s.addText("Côté légal, la biométrie est le vrai sujet", { placeholder: "title" });
    const blocs = [
      [I.cadenas, "RGPD, article 9", "Les données biométriques sont interdites par principe. Exception utilisable : un consentement explicite et libre, donc une alternative sans visage doit exister."],
      [I.loi, "AI Act européen", "L'identification biométrique à distance est classée « haut risque » (annexe III). Obligations reportées au 2 décembre 2027 par l'accord Omnibus de juin 2026."],
      [I.bouclier, "CNIL et analyse d'impact", "Le consentement ne se présume pas en entrant en boutique. Une analyse d'impact (AIPD) est à mener avant tout déploiement."],
      [I.code, "Licence des modèles", "Les modèles InsightFace utilisés sont réservés à la recherche non commerciale. Un usage réel imposerait des modèles sous licence commerciale."],
    ];
    const lw = (LARGEUR_UTILE - 0.4) / 2;
    blocs.forEach(([img, titre, detail], i) => {
      const x = MARGE + (i % 2) * (lw + 0.4);
      const y = 1.6 + Math.floor(i / 2) * 2.25;
      carte(s, x, y, lw, 2.0, `legal-${i}`);
      pastille(s, img, x + 0.3, y + 0.3, 0.7, { fond: C.background1, nom: `legal-${i}` });
      texte(s, titre, { x: x + 1.2, y: y + 0.32, w: lw - 1.45, h: 0.45, fontSize: 18, bold: true });
      texte(s, detail, { x: x + 1.2, y: y + 0.8, w: lw - 1.45, h: 1.15, fontSize: 13, color: C.accent4 });
    });
    texte(s, "Ce que nous avons appliqué : consentement « J'ACCEPTE » daté avant toute capture, aucune photo conservée, visages inconnus jamais enregistrés, suppression à la demande. Analyse non exhaustive, à faire valider par un juriste.", { x: MARGE, y: 6.15, w: LARGEUR_UTILE, h: 0.7, fontSize: 12, italic: true, color: C.accent4 });
    s.addNotes(
      "Sources : RGPD article 9 ; AI Act, annexe III point 1(a) ; accord Omnibus voté par le Parlement le 16 juin 2026 et approuvé par le Conseil le 29 juin 2026, publication au Journal officiel à vérifier ; " +
        "positions de la CNIL rapportées par la presse sur les caméras intelligentes en magasin. Ce n'est pas un avis juridique.",
    );
  }

  // 14. Limites hardware
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Limites" });
    s.addText("Côté matériel, la caméra compte autant que le modèle", { placeholder: "title" });
    const lignes = [
      [I.camera, "Caméra", `Webcam HD minimum. Au-delà de ${fr(distanceFiable, 0)} m ou avec un flou de bougé, la reconnaissance chute.`],
      [I.ampoule, "Éclairage", "Le modèle tolère une lumière faible, mais un contre-jour ou un éclairage latéral fort dégradent le cadrage."],
      [I.boutique, "Placement", "À l'entrée, à hauteur de visage, face au flux. Plusieurs personnes à la fois : une seule fiche affichée."],
      [I.puce, "Poste de calcul", `PC récent : ${fr(defaut.tot)} ms par analyse sur un Ryzen 7 5800H. Un poste plus ancien ou une tablette seront plus lents.`],
      [I.navigateur, "Navigateur et réseau", "Chrome ou Edge récents conseillés. 15 Mo à télécharger au premier lancement, ensuite tout fonctionne sur place."],
    ];
    lignes.forEach(([img, titre, detail], i) => {
      const y = 1.6 + i * 0.88;
      pastille(s, img, MARGE, y, 0.66, { nom: `materiel-${i}` });
      texte(s, titre, { x: MARGE + 0.9, y: y + 0.04, w: 2.4, h: 0.6, fontSize: 17, bold: true, valign: "middle" });
      texte(s, detail, { x: MARGE + 3.35, y: y + 0.04, w: 8.75, h: 0.6, fontSize: 14, color: C.accent4, valign: "middle" });
    });
    carte(s, MARGE, 6.2, LARGEUR_UTILE, 0.62, "cout-materiel");
    texte(s, "Ordre de grandeur par point d'accueil : une webcam (50 à 150 €) et un PC existant suffisent pour le POC, sans serveur ni abonnement.", { x: MARGE + 0.25, y: 6.27, w: LARGEUR_UTILE - 0.5, h: 0.5, fontSize: 13, valign: "middle" });
    s.addNotes(
      "Le message principal : la performance mesurée dépend autant du matériel et de l'installation que du modèle. " +
        "Les fourchettes de prix sont des ordres de grandeur, pas un devis.",
    );
  }

  // 15. Limites commerciales
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Limites" });
    s.addText("Côté vente, le frein principal n'est pas la technologie", { placeholder: "title" });
    const freins = [
      ["Acceptabilité", "Dans le luxe, la discrétion prime : être reconnu sans l'avoir demandé peut être vécu comme de la surveillance."],
      ["Consentement réel", "Le service doit rester aussi bon sans reconnaissance faciale, sinon le consentement n'est pas libre."],
      ["Erreur coûteuse", "Afficher la fiche d'un autre client expose ses achats et ses notes : une erreur rare mais grave."],
      ["Intégration", "La valeur vient de la fiche : il faut se brancher sur l'outil de relation client existant."],
    ];
    freins.forEach(([titre, detail], i) => {
      const y = 1.6 + i * 1.18;
      pastille(s, I.alerte, MARGE, y + 0.05, 0.6, { nom: `frein-${i}` });
      texte(s, titre, { x: MARGE + 0.85, y, w: 5.2, h: 0.4, fontSize: 17, bold: true });
      texte(s, detail, { x: MARGE + 0.85, y: y + 0.4, w: 5.2, h: 0.75, fontSize: 13, color: C.accent4 });
    });
    carte(s, 7.0, 1.55, 5.75, 4.75, "positionnement");
    texte(s, "Un positionnement réaliste", { x: 7.3, y: 1.8, w: 5.15, h: 0.45, fontSize: 18, bold: true, color: C.accent1 });
    texte(
      s,
      [
        { text: "Programme réservé aux clients fidèles qui le demandent, jamais par défaut.", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
        { text: "Le conseiller garde la main : bouton Masquer la fiche, aucune action automatique.", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
        { text: "Alternative sans visage proposée : carte de fidélité ou application.", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
        { text: "Indicateur de succès à suivre : part des clients invités qui acceptent, et leur satisfaction.", options: { bullet: true } },
      ],
      { x: 7.3, y: 2.35, w: 5.15, h: 3.8, fontSize: 15 },
    );
    s.addNotes(
      "Le prototype prouve que la technique est accessible : quelques centaines d'euros de matériel et un navigateur. " +
        "La vraie question business est l'acceptation par les clients, et le cadre légal qui impose un vrai choix.",
    );
  }

  // ===== Section 5 : bilan =====
  pres.addSection({ title: "Bilan" });

  // 16. Ce que montre le projet
  {
    const s = diapositive({ masterName: "CONTENU", sectionTitle: "Bilan" });
    s.addText("Ce que ce projet dit de l'IA aujourd'hui", { placeholder: "title" });
    const colonnes = [
      [I.valide, "Ce qu'elle fait déjà bien", [
        "Reconnaître un visage connu en une fraction de seconde, sur un PC ordinaire.",
        "Tourner sans serveur, dans un simple navigateur, avec 15 Mo de modèles.",
        "Rester stable malgré une lumière faible ou une image compressée.",
      ], C.accent6],
      [I.alerte, "Ce qui reste difficile", [
        "Les conditions réelles : distance, flou, visages masqués ou de profil.",
        "La fraude, l'équité entre profils et l'évaluation à grande échelle.",
        "Le cadre : consentement, droit de la biométrie, acceptation par les clients.",
      ], C.accent5],
    ];
    colonnes.forEach(([img, titre, points, couleur], i) => {
      const x = MARGE + i * 6.2;
      carte(s, x, 1.6, 5.9, 3.55, `colonne-${i}`);
      pastille(s, img, x + 0.3, 1.85, 0.6, { fond: C.background1, nom: `colonne-${i}` });
      texte(s, titre, { x: x + 1.1, y: 1.9, w: 4.6, h: 0.5, fontSize: 18, bold: true, color: couleur, valign: "middle" });
      texte(s, points.map((p, j) => ({ text: p, options: { bullet: true, breakLine: j < points.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.35, y: 2.65, w: 5.25, h: 2.4, fontSize: 14 });
    });
    texte(s, "Compétences mobilisées", { x: MARGE, y: 5.4, w: 4, h: 0.4, fontSize: 15, bold: true, color: C.accent1 });
    const competences = ["Cadrage produit", "IA embarquée", "Mesure et KPI", "Droit du numérique", "Qualité logicielle"];
    const cw = (LARGEUR_UTILE - 4 * 0.25) / 5;
    competences.forEach((c, i) => {
      const x = MARGE + i * (cw + 0.25);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.9, w: cw, h: 0.6, rectRadius: 0.3, fill: { color: C.background1 }, line: { color: C.accent1, width: 1 }, objectName: `competence-${i}` });
      texte(s, c, { x, y: 5.9, w: cw, h: 0.6, fontSize: 14, align: "center", valign: "middle" });
    });
    s.addNotes(
      "Le message à retenir : la reconnaissance faciale est devenue techniquement accessible, ce qui rend les questions de cadre d'autant plus importantes. " +
        "Le projet nous a fait travailler aussi bien l'IA que la mesure, le droit et le produit.",
    );
  }

  // 17. Conclusion
  {
    const s = diapositive({ masterName: "OUVERTURE", sectionTitle: "Bilan" });
    s.addText("PROCHAINES ÉTAPES", { placeholder: "surtitre" });
    s.addText("Un concept faisable, à encadrer avant d'être déployé", { placeholder: "title" });
    const etapes = [
      "Tester avec un panel volontaire, en vraie boutique et sur plusieurs jours.",
      "Ajouter la détection de fraude et passer à des modèles sous licence commerciale.",
      "Mener l'analyse d'impact et concevoir le parcours d'adhésion des clients.",
    ];
    etapes.forEach((t, i) => {
      const y = 3.95 + i * 0.62;
      s.addShape(pres.shapes.OVAL, { x: MARGE, y: y + 0.06, w: 0.36, h: 0.36, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: `suite-${i}` });
      texte(s, String(i + 1), { x: MARGE, y: y + 0.06, w: 0.36, h: 0.36, fontSize: 13, bold: true, color: C.text2, align: "center", valign: "middle" });
      texte(s, t, { x: MARGE + 0.6, y, w: 9.5, h: 0.5, fontSize: 17, color: "E9E4DA", valign: "middle" });
    });
    texte(s, `Merci. Démo : mathos34.github.io/reconnaissance-equipe  ·  Code : github.com/Mathos34/reconnaissance-equipe`, { x: MARGE, y: 6.35, w: 10, h: 0.4, fontSize: 13, color: C.accent1 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 10.85, y: 4.95, w: 1.9, h: 1.9, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, objectName: "qr-fond-fin" });
    s.addImage({ data: qr, x: 10.95, y: 5.05, w: 1.7, h: 1.7, objectName: "qr-fin", altText: "QR code vers la démo en ligne" });
    s.addNotes("Conclure sur l'équilibre : techniquement faisable aujourd'hui, mais le déploiement réel demande d'abord un cadre. Ouvrir aux questions.");
  }

  await pres.writeFile({ fileName: SORTIE });
  if (SKILL_THEME) {
    const { applyTheme } = require(SKILL_THEME);
    await applyTheme(SORTIE, THEME);
  }
  console.log(`Présentation écrite : ${SORTIE}`);
  console.log(`Démo : ${nomDemo} (${fr(demo.tot)} ms, délai ${fr(demo.delai)} ms). Défaut : ${fr(defaut.tot)} ms. Distance fiable ${distanceFiable} m, FAR ${auSeuil.far} %`);
}

construire().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
