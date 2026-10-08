"""Test de bout en bout dans un vrai navigateur (Microsoft Edge), avec une caméra simulée.

Parcours :
1. Page Clients : capture de 25 images, saisie de la fiche, consentement tapé, enregistrement.
2. Export de la sauvegarde.
3. Page Reconnaissance : la personne enregistrée est reconnue et sa fiche s'affiche.
4. Profil vierge : import de la sauvegarde, puis un visage inconnu reste « Inconnu ».

Prérequis (non versionnés, ils contiennent des images) :
- MT_VIDEO_ENREGISTREMENT : vidéo YUV4MPEG2 d'un visage isolé, utilisée pour l'inscription et la reconnaissance ;
- MT_VIDEO_INCONNU : vidéo YUV4MPEG2 d'un autre visage ;
- MT_EDGE (facultatif) : chemin de msedge.exe, par défaut l'installation Windows standard.

Lancement : python site/tests/e2e/test_navigateur.py
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import expect, sync_playwright

SITE = pathlib.Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("MT_PORT", "8791"))
# Par défaut : serveur local sur le dossier site/. MT_URL permet de tester le site publié.
URL_PUBLIEE = os.environ.get("MT_URL")
URL = URL_PUBLIEE or f"http://127.0.0.1:{PORT}"
EDGE = os.environ.get("MT_EDGE", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
TIMEOUT_CAPTURE = 240_000


def lancer_navigateur(p, video: str):
    return p.chromium.launch(
        executable_path=EDGE,
        headless=True,
        args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-video-capture={video}",
            "--autoplay-policy=no-user-gesture-required",
            "--no-sandbox",
        ],
    )


def nouvelle_page(navigateur, erreurs: list[str]):
    contexte = navigateur.new_context(permissions=["camera"], viewport={"width": 1920, "height": 1080})
    page = contexte.new_page()
    page.on("pageerror", lambda e: erreurs.append(f"page: {e}"))
    page.on("console", lambda m: erreurs.append(f"console: {m.text}") if m.type == "error" else None)
    return contexte, page


def inscrire_claire(page):
    page.goto(f"{URL}/clients.html")
    page.click("#activer")
    expect(page.locator("#compte")).to_have_text("25", timeout=TIMEOUT_CAPTURE)

    page.click("#etapes li[data-etape='2'] button")
    page.select_option("select[name=civilite]", "Madame")
    page.fill("input[name=prenom]", "Claire")
    page.fill("input[name=nom]", "Test")
    page.fill("input[name=conseiller]", "Camille Conseil")
    page.fill("input[name=boisson]", "café glacé")
    page.check("input[name=temperature][value=froid]")
    page.select_option("select[name=sucre]", "non")
    page.select_option("select[name=lait]", "lait d'amande")

    page.click("#etapes li[data-etape='3'] button")
    page.fill("#consentement", "J'ACCEPTE")
    expect(page.locator("#enregistrer")).to_be_enabled()
    page.click("#enregistrer")
    expect(page.locator("#titre-editeur")).to_have_text("Claire Test")


def exporter(page, chemin: pathlib.Path):
    page.once("dialog", lambda d: d.accept())
    with page.expect_download() as telechargement:
        page.click("#exporter")
    telechargement.value.save_as(chemin)


def reconnaitre_claire(page):
    page.goto(f"{URL}/index.html")
    page.click("#demarrer")
    expect(page.locator("#fiche")).to_be_visible(timeout=TIMEOUT_CAPTURE)
    expect(page.locator("#nom-complet")).to_have_text("Madame Claire Test")
    expect(page.locator("#accroche")).to_contain_text("Bonjour Madame Test")


def main() -> int:
    video_claire = os.environ["MT_VIDEO_ENREGISTREMENT"]
    video_inconnu = os.environ["MT_VIDEO_INCONNU"]
    erreurs: list[str] = []
    dossier = pathlib.Path(tempfile.mkdtemp(prefix="maison-test-e2e-"))
    sauvegarde = dossier / "sauvegarde.json"

    serveur = None
    if not URL_PUBLIEE:
        serveur = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", str(SITE)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    try:
        time.sleep(1)
        with sync_playwright() as p:
            # Passage 1 : inscription, export, reconnaissance.
            navigateur = lancer_navigateur(p, video_claire)
            contexte, page = nouvelle_page(navigateur, erreurs)
            inscrire_claire(page)
            exporter(page, sauvegarde)
            print("ok : client enregistré et sauvegarde exportée")
            reconnaitre_claire(page)
            print("ok : la personne enregistrée est reconnue, fiche affichée")
            navigateur.close()

            # Passage 2 : profil vierge, import, puis un visage inconnu.
            navigateur = lancer_navigateur(p, video_inconnu)
            contexte, page = nouvelle_page(navigateur, erreurs)
            page.goto(f"{URL}/clients.html")
            page.set_input_files("#importer", str(sauvegarde))
            expect(page.locator("#liste")).to_contain_text("Claire Test", timeout=30_000)
            print("ok : sauvegarde importée dans un profil vierge")

            page.goto(f"{URL}/index.html")
            page.click("#demarrer")
            expect(page.locator("#similarite")).not_to_have_text("Similarité : -", timeout=TIMEOUT_CAPTURE)
            time.sleep(4)
            expect(page.locator("#fiche")).to_be_hidden()
            expect(page.locator("#accueil-fiche")).to_be_visible()
            similarite = page.locator("#similarite").inner_text()
            print(f"ok : visage inconnu, pas de fiche affichée ({similarite})")
            navigateur.close()
    finally:
        if serveur is not None:
            serveur.terminate()

    if erreurs:
        print("erreurs navigateur :")
        for e in erreurs:
            print("  ", e)
    else:
        print("aucune erreur JavaScript dans la console")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
