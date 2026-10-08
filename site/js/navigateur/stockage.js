// Choix du stockage : localStorage du navigateur, ou mémoire seule si le navigateur le bloque (navigation privée).

import { StockageMemoire } from "../coeur/base.js";

/** Renvoie { stockage, persistant } : persistant vaut false si les données disparaîtront à la fermeture. */
export function choisirStockage() {
  try {
    const cle = "maison-test/test";
    window.localStorage.setItem(cle, "1");
    window.localStorage.removeItem(cle);
    return { stockage: window.localStorage, persistant: true };
  } catch {
    return { stockage: new StockageMemoire(), persistant: false };
  }
}
