"""Captures d'écran de l'application pour la présentation (Edge, caméra simulée, 1920 x 1080).

Les visages visibles sur les captures sont pixélisés avant enregistrement : la présentation est destinée
à être partagée (LinkedIn), et les visages de test viennent d'images d'exemple d'InsightFace.

Prérequis : python evaluation/preparer_donnees.py
Usage : python presentation/captures.py  ->  presentation/images/*.png
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import cv2
from playwright.sync_api import expect, sync_playwright

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "evaluation"))
from commun import DOSSIER_DONNEES, application  # noqa: E402

SITE = RACINE / "site"
SORTIE = RACINE / "presentation" / "images"
PORT = 8798
URL = f"http://127.0.0.1:{PORT}"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def pixeliser(chemin: Path, app) -> int:
    """Remplace chaque visage détecté par une mosaïque grossière. Renvoie le nombre de visages masqués."""
    image = cv2.imread(str(chemin))
    visages = app.get(image)
    for f in visages:
        x1, y1, x2, y2 = f.bbox
        marge = 0.35 * (x2 - x1)
        x1, y1 = int(max(0, x1 - marge)), int(max(0, y1 - marge))
        x2, y2 = int(min(image.shape[1], x2 + marge)), int(min(image.shape[0], y2 + marge))
        zone = image[y1:y2, x1:x2]
        petite = cv2.resize(zone, (8, 8), interpolation=cv2.INTER_AREA)
        image[y1:y2, x1:x2] = cv2.resize(petite, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(str(chemin), image)
    return len(visages)


def session(page, moteur: str, duree: float = 8) -> None:
    page.goto(f"{URL}/index.html?moteur={moteur}")
    page.click("#demarrer")
    expect(page.locator("#kpi-moteur")).not_to_have_text("-", timeout=120_000)
    time.sleep(duree)
    page.click("#arreter")


def main() -> int:
    video = DOSSIER_DONNEES / "camera_enregistrement.y4m"
    if not video.exists():
        print("Lancer d'abord : python evaluation/preparer_donnees.py")
        return 2
    SORTIE.mkdir(parents=True, exist_ok=True)
    serveur = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", str(SITE)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    captures = []
    try:
        time.sleep(1)
        with sync_playwright() as p:
            navigateur = p.chromium.launch(
                executable_path=EDGE,
                headless=True,
                args=[
                    "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream",
                    f"--use-file-for-fake-video-capture={video}",
                    "--autoplay-policy=no-user-gesture-required",
                    "--enable-unsafe-webgpu",
                    "--no-sandbox",
                ],
            )
            page = navigateur.new_context(permissions=["camera"], viewport={"width": 1920, "height": 1080}).new_page()

            # 1. Clients : consentement puis capture guidée.
            page.goto(f"{URL}/clients.html")
            page.fill("#consentement", "J'ACCEPTE")
            page.click("#activer")
            expect(page.locator("#compte")).to_have_text("12", timeout=240_000)
            page.screenshot(path=str(SORTIE / "capture.png"))
            captures.append("capture.png")
            expect(page.locator("#compte")).to_have_text("25", timeout=240_000)

            # 2. Fiche.
            page.click("#etapes li[data-etape='2'] button")
            page.select_option("select[name=civilite]", "Madame")
            page.fill("input[name=prenom]", "Claire")
            page.fill("input[name=nom]", "Test")
            page.fill("input[name=conseiller]", "Camille Conseil")
            page.fill("input[name=boisson]", "café glacé")
            page.check("input[name=temperature][value=froid]")
            page.select_option("select[name=lait]", "lait d'amande")
            page.fill("input[name=taille_vetement]", "38")
            page.fill("input[name=styles]", "minimaliste, couleurs sobres")
            for date, article, montant in (("2026-09-14", "Sac cuir tilleul", "1240"), ("2026-07-02", "Carnet cuir", "85")):
                page.click("#ajouter-achat")
                ligne = page.locator("#achats .achat").last
                ligne.locator("[name=achat-date]").fill(date)
                ligne.locator("[name=achat-article]").fill(article)
                ligne.locator("[name=achat-montant]").fill(montant)
            page.fill("textarea[name=notes]", "Aime être accueillie rapidement. Préfère les rendez-vous en fin de matinée.")
            page.fill("input[name=prochain_rendez_vous]", "2026-11-20T10:30")
            page.screenshot(path=str(SORTIE / "fiche.png"))
            captures.append("fiche.png")
            page.click("#etapes li[data-etape='3'] button")
            page.click("#enregistrer")
            expect(page.locator("#titre-editeur")).to_have_text("Claire Test")

            # 3. Reconnaissance.
            page.goto(f"{URL}/index.html")
            page.click("#demarrer")
            expect(page.locator("#fiche")).to_be_visible(timeout=240_000)
            time.sleep(3)
            page.screenshot(path=str(SORTIE / "reconnaissance.png"))
            captures.append("reconnaissance.png")
            page.click("#arreter")

            # 4. Quelques sessions de plus, puis le tableau de bord des indicateurs.
            for moteur in ("wasm", "webgpu", "wasm"):
                session(page, moteur)
            page.goto(f"{URL}/indicateurs.html")
            time.sleep(1)
            page.screenshot(path=str(SORTIE / "indicateurs.png"), full_page=False)
            captures.append("indicateurs.png")
            page.screenshot(path=str(SORTIE / "indicateurs_complet.png"), full_page=True)
            captures.append("indicateurs_complet.png")
            navigateur.close()
    finally:
        serveur.terminate()

    app = application()
    for nom in captures:
        print(f"{nom} : {pixeliser(SORTIE / nom, app)} visage(s) pixélisé(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
