// Graphiques SVG sans bibliothèque pour la page Indicateurs.
// Règles appliquées : un seul axe, barres fines arrondies côté valeur, grille discrète,
// légende dès deux séries, libellés directs sélectifs, infobulle au survol et au clavier,
// et une vue tableau pour chaque graphique. Couleurs : variables CSS --serie-1 à --serie-3.

const SVG = "http://www.w3.org/2000/svg";
const LARGEUR = 640;

function el(nom, attributs = {}, texte = null) {
  const noeud = document.createElementNS(SVG, nom);
  for (const [cle, valeur] of Object.entries(attributs)) noeud.setAttribute(cle, valeur);
  if (texte !== null) noeud.textContent = texte;
  return noeud;
}

// ---------- infobulle partagée ----------

let infobulle = null;
function bulle() {
  if (!infobulle) {
    infobulle = document.createElement("div");
    infobulle.className = "infobulle";
    infobulle.setAttribute("role", "tooltip");
    infobulle.hidden = true;
    document.body.append(infobulle);
  }
  return infobulle;
}

function attacherInfobulle(marque, texte) {
  marque.setAttribute("tabindex", "0");
  marque.setAttribute("aria-label", texte);
  const montrer = (x, y) => {
    const b = bulle();
    b.textContent = texte;
    b.hidden = false;
    b.style.left = `${Math.min(x + 14, window.innerWidth - b.offsetWidth - 8)}px`;
    b.style.top = `${y + 14}px`;
  };
  marque.addEventListener("pointermove", (e) => montrer(e.clientX, e.clientY));
  marque.addEventListener("focus", () => {
    const r = marque.getBoundingClientRect();
    montrer(r.right, r.top);
  });
  for (const evt of ["pointerleave", "blur"]) marque.addEventListener(evt, () => (bulle().hidden = true));
}

// ---------- formes ----------

/** Barre horizontale dont seule l'extrémité droite (côté valeur) est arrondie. */
function barreHorizontale(x, y, l, h, r = 4) {
  const rr = Math.min(r, l / 2, h / 2);
  if (l <= 0) return "";
  return `M${x},${y}H${x + l - rr}Q${x + l},${y} ${x + l},${y + rr}V${y + h - rr}Q${x + l},${y + h} ${x + l - rr},${y + h}H${x}Z`;
}

/** Barre verticale dont seule l'extrémité haute est arrondie, posée sur la ligne de base. */
function barreVerticale(x, base, l, h, r = 4) {
  const rr = Math.min(r, l / 2, h / 2);
  if (h <= 0) return "";
  const haut = base - h;
  return `M${x},${base}V${haut + rr}Q${x},${haut} ${x + rr},${haut}H${x + l - rr}Q${x + l},${haut} ${x + l},${haut + rr}V${base}Z`;
}

function graduations(max, nombre = 4) {
  if (max <= 0) return [0];
  const brut = max / nombre;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut);
  const valeurs = [];
  for (let v = 0; v <= max + pas * 0.001; v += pas) valeurs.push(+v.toFixed(6));
  if (valeurs[valeurs.length - 1] < max) valeurs.push(+(valeurs[valeurs.length - 1] + pas).toFixed(6));
  return valeurs;
}

function legende(series) {
  const ul = document.createElement("ul");
  ul.className = "legende";
  for (const s of series) {
    const li = document.createElement("li");
    const pastille = document.createElement("span");
    pastille.className = "pastille-serie";
    pastille.style.background = s.couleur;
    li.append(pastille, document.createTextNode(s.nom));
    ul.append(li);
  }
  return ul;
}

/** Vue tableau repliable : la version accessible de chaque graphique. */
export function tableauDonnees(conteneur, entetes, lignes) {
  const details = document.createElement("details");
  details.className = "donnees";
  const resume = document.createElement("summary");
  resume.textContent = "Voir les données";
  const table = document.createElement("table");
  const tr = document.createElement("tr");
  for (const e of entetes) tr.append(Object.assign(document.createElement("th"), { textContent: e, scope: "col" }));
  const thead = document.createElement("thead");
  thead.append(tr);
  const tbody = document.createElement("tbody");
  for (const ligne of lignes) {
    const r = document.createElement("tr");
    for (const cellule of ligne) r.append(Object.assign(document.createElement("td"), { textContent: cellule }));
    tbody.append(r);
  }
  table.append(thead, tbody);
  details.append(resume, table);
  conteneur.append(details);
}

function vide(conteneur, message) {
  conteneur.replaceChildren(Object.assign(document.createElement("p"), { className: "graphique-vide", textContent: message }));
}

// ---------- barres horizontales (une série) ----------

export function barresHorizontales(conteneur, { donnees, format = String, couleur = "var(--serie-1)", titreAccessible, messageVide }) {
  if (!donnees.length) return vide(conteneur, messageVide);
  conteneur.replaceChildren();
  const hauteurBarre = 20;
  const ecart = 12;
  const margeGauche = Math.min(300, 16 + 7.2 * Math.max(...donnees.map((d) => d.libelle.length)));
  const margeDroite = 70;
  const hauteur = donnees.length * (hauteurBarre + ecart) + ecart;
  const max = Math.max(...donnees.map((d) => d.valeur), 1e-9);
  const svg = el("svg", { viewBox: `0 0 ${LARGEUR} ${hauteur}`, role: "img", "aria-label": titreAccessible, class: "graphique" });
  svg.append(el("line", { x1: margeGauche, x2: margeGauche, y1: 0, y2: hauteur, class: "axe" }));
  donnees.forEach((d, i) => {
    const y = ecart + i * (hauteurBarre + ecart);
    const longueur = ((LARGEUR - margeGauche - margeDroite) * d.valeur) / max;
    svg.append(el("text", { x: margeGauche - 8, y: y + hauteurBarre / 2, class: "etiquette", "text-anchor": "end", "dominant-baseline": "middle" }, d.libelle));
    const barre = el("path", { d: barreHorizontale(margeGauche + 1, y, longueur, hauteurBarre), fill: couleur, class: "marque" });
    attacherInfobulle(barre, `${d.libelle} : ${format(d.valeur)}`);
    svg.append(barre);
    svg.append(el("text", { x: margeGauche + longueur + 8, y: y + hauteurBarre / 2, class: "valeur", "dominant-baseline": "middle" }, format(d.valeur)));
  });
  conteneur.append(svg);
  tableauDonnees(conteneur, ["Catégorie", "Valeur"], donnees.map((d) => [d.libelle, format(d.valeur)]));
}

// ---------- colonnes (une série, ou empilées sur plusieurs séries) ----------

export function colonnes(conteneur, { categories, series, format = String, unite = "", titreAccessible, messageVide, marqueur = null }) {
  if (!categories.length) return vide(conteneur, messageVide);
  conteneur.replaceChildren();
  const hauteur = 260;
  const margeGauche = 48;
  const margeBas = 44;
  const margeHaut = 16;
  const base = hauteur - margeBas;
  const totaux = categories.map((_, i) => series.reduce((s, serie) => s + (serie.valeurs[i] ?? 0), 0));
  const graduees = graduations(Math.max(...totaux, marqueur?.valeur ?? 0, 1e-9));
  const max = graduees[graduees.length - 1];
  const echelle = (v) => ((base - margeHaut) * v) / max;
  const largeurZone = LARGEUR - margeGauche - 12;
  const pasX = largeurZone / categories.length;
  const largeurBarre = Math.max(4, Math.min(42, pasX * 0.6));

  const svg = el("svg", { viewBox: `0 0 ${LARGEUR} ${hauteur}`, role: "img", "aria-label": titreAccessible, class: "graphique" });
  for (const g of graduees) {
    const y = base - echelle(g);
    svg.append(el("line", { x1: margeGauche, x2: LARGEUR - 12, y1: y, y2: y, class: g === 0 ? "axe" : "grille" }));
    svg.append(el("text", { x: margeGauche - 8, y, class: "graduation", "text-anchor": "end", "dominant-baseline": "middle" }, format(g)));
  }
  if (unite) svg.append(el("text", { x: margeGauche - 8, y: 8, class: "graduation", "text-anchor": "end" }, unite));

  categories.forEach((categorie, i) => {
    const x = margeGauche + i * pasX + (pasX - largeurBarre) / 2;
    let cumul = 0;
    series.forEach((serie, s) => {
      const v = serie.valeurs[i] ?? 0;
      if (v <= 0) return;
      const h = echelle(v);
      const dernier = series.slice(s + 1).every((autre) => !(autre.valeurs[i] > 0));
      // Écart de 2 px entre deux segments empilés, arrondi seulement sur le segment du haut.
      const bas = base - echelle(cumul) - (cumul > 0 ? 2 : 0);
      const hauteurSegment = Math.max(0, h - (cumul > 0 ? 2 : 0));
      const d = dernier
        ? barreVerticale(x, bas, largeurBarre, hauteurSegment)
        : `M${x},${bas}V${bas - hauteurSegment}H${x + largeurBarre}V${bas}Z`;
      const barre = el("path", { d, fill: serie.couleur, class: "marque" });
      attacherInfobulle(barre, `${categorie} · ${series.length > 1 ? `${serie.nom} : ` : ""}${format(v)}${unite ? ` ${unite}` : ""}`);
      svg.append(barre);
      cumul += v;
    });
    const pas = Math.ceil(categories.length / 12);
    if (i % pas === 0) {
      svg.append(el("text", { x: x + largeurBarre / 2, y: base + 18, class: "etiquette", "text-anchor": "middle" }, categorie));
    }
  });

  if (marqueur) {
    const xm = margeGauche + marqueur.position * largeurZone;
    svg.append(el("line", { x1: xm, x2: xm, y1: margeHaut, y2: base, class: "repere" }));
    svg.append(el("text", { x: xm + 6, y: margeHaut + 10, class: "valeur" }, marqueur.libelle));
  }

  conteneur.append(svg);
  if (series.length > 1) conteneur.append(legende(series));
  tableauDonnees(
    conteneur,
    ["Catégorie", ...series.map((s) => s.nom)],
    categories.map((c, i) => [c, ...series.map((s) => (s.valeurs[i] === null || s.valeurs[i] === undefined ? "-" : format(s.valeurs[i])))]),
  );
}
