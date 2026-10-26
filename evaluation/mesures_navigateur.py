"""Mesures de performance dans le navigateur, relevées par les indicateurs du site lui-même.

Microsoft Edge pilote le site avec une caméra simulée (vidéos de evaluation/donnees/) :
1. une inscription complète (consentement, 25 images, fiche) : indicateurs d'enrôlement ;
2. plusieurs sessions de reconnaissance par moteur : WASM (par défaut), WebGPU, puis hybride
   (détection en WebGPU, reconnaissance en WASM), choisis par le paramètre d'URL ?moteur= ;
3. des sessions avec un visage jamais enregistré, pour la distribution des similarités d'inconnus.

Limite : la caméra simulée répète la même image. Les temps de calcul et le délai avant reconnaissance
sont réalistes ; les similarités des personnes connues (proches de 1) ne le sont pas, voir robustesse.py.

Usage : python evaluation/mesures_navigateur.py  ->  evaluation/resultats/navigateur.json
"""

from __future__ import annotations

import importlib.util
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from commun import DOSSIER_DONNEES, DOSSIER_RESULTATS, RACINE, ecrire_json  # noqa: E402

SITE = RACINE / "site"
PORT = 8797
URL = f"http://127.0.0.1:{PORT}"
EDGE = os.environ.get("MT_EDGE", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
SESSIONS_PAR_MOTEUR = int(os.environ.get("MT_SESSIONS", "5"))
DUREE_SESSION_S = float(os.environ.get("MT_DUREE", "12"))
# MT_GPU_HAUTE_PERF=1 : force le GPU dédié (sur ce PC, la RTX 3060 au lieu du GPU intégré AMD).
GPU_HAUTE_PERF = os.environ.get("MT_GPU_HAUTE_PERF") == "1"
FICHIER = "navigateur_gpu_dedie.json" if GPU_HAUTE_PERF else "navigateur.json"
CLE_JOURNAL = "maison-test/indicateurs/v1"

# Réutilise le parcours d'inscription du test de bout en bout.
_spec = importlib.util.spec_from_file_location("e2e", SITE / "tests" / "e2e" / "test_navigateur.py")
e2e = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(e2e)
e2e.URL = URL


def lancer(p, video: Path):
    return p.chromium.launch(
        executable_path=EDGE,
        headless=True,
        args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-video-capture={video}",
            "--autoplay-policy=no-user-gesture-required",
            "--enable-unsafe-webgpu",
            "--no-sandbox",
            *(["--force_high_performance_gpu"] if GPU_HAUTE_PERF else []),
        ],
    )


def journal(page) -> list[dict]:
    return json.loads(page.evaluate(f"() => localStorage.getItem('{CLE_JOURNAL}') || '[]'"))


def session(page, moteur: str) -> str | None:
    """Une session de reconnaissance. Renvoie un message d'erreur si le moteur est indisponible."""
    page.goto(f"{URL}/index.html?moteur={moteur}")
    page.click("#demarrer")
    debut = time.time()
    while time.time() - debut < 120:
        if page.locator("#kpi-moteur").inner_text() != "-":
            break
        if not page.locator("#vide-camera").is_hidden() and "indisponibles" in page.locator("#message-camera").inner_text():
            return page.locator("#message-camera").inner_text()
        time.sleep(0.5)
    else:
        return "délai de chargement dépassé"
    time.sleep(DUREE_SESSION_S)
    page.click("#arreter")
    return None


def infos_navigateur(page) -> dict:
    return page.evaluate(
        """async () => ({
            userAgent: navigator.userAgent,
            coeursLogiques: navigator.hardwareConcurrency,
            webgpu: await (async () => {
                const a = navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null));
                return a ? `${a.info?.vendor}/${a.info?.architecture}` : null;
            })(),
        })"""
    )


def main() -> int:
    video_connue = DOSSIER_DONNEES / "camera_enregistrement.y4m"
    video_inconnue = DOSSIER_DONNEES / "camera_inconnu.y4m"
    if not video_connue.exists():
        print("Lancer d'abord : python evaluation/preparer_donnees.py")
        return 2

    serveur = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", str(SITE)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    sauvegarde = Path(tempfile.mkdtemp(prefix="maison-test-mesures-")) / "sauvegarde.json"
    resultat = {"date": datetime.now().isoformat(timespec="seconds"), "machine": platform.processor(), "dureeSessionS": DUREE_SESSION_S, "moteurs": {}}
    try:
        time.sleep(1)
        with sync_playwright() as p:
            navigateur = lancer(p, video_connue)
            page = navigateur.new_context(permissions=["camera"], viewport={"width": 1920, "height": 1080}).new_page()
            page.goto(f"{URL}/clients.html")
            resultat["navigateur"] = infos_navigateur(page)
            e2e.inscrire_claire(page)
            e2e.exporter(page, sauvegarde)
            resultat["enrolements"] = [e for e in journal(page) if e["type"] == "enrolement"]
            print(f"Inscription : {resultat['enrolements'][-1]['dureeS']} s, {resultat['enrolements'][-1]['tauxValides']} % d'images valides")

            for moteur in ("wasm", "webgpu", "hybride"):
                erreur = None
                for i in range(SESSIONS_PAR_MOTEUR):
                    erreur = session(page, moteur)
                    if erreur:
                        break
                sessions = [e for e in journal(page) if e["type"] == "reconnaissance" and e["fournisseur"] == moteur]
                resultat["moteurs"][moteur] = {"disponible": erreur is None, "erreur": erreur, "sessions": sessions}
                if sessions:
                    print(f"{moteur} : {len(sessions)} sessions, analyse médiane {[s['latenceMs']['totale']['p50'] for s in sessions]} ms")
                else:
                    print(f"{moteur} : indisponible ({erreur})")
            navigateur.close()

            # Visage inconnu : profil vierge, import de la sauvegarde, puis sessions de reconnaissance.
            navigateur = lancer(p, video_inconnue)
            page = navigateur.new_context(permissions=["camera"]).new_page()
            page.goto(f"{URL}/clients.html")
            page.set_input_files("#importer", str(sauvegarde))
            expect(page.locator("#liste")).to_contain_text("Claire Test", timeout=30_000)
            for _ in range(2):
                session(page, "wasm")
            resultat["inconnu"] = [e for e in journal(page) if e["type"] == "reconnaissance"]
            print(f"Inconnu : {sum(s['pistesReconnues'] for s in resultat['inconnu'])} fausse(s) reconnaissance(s) sur {len(resultat['inconnu'])} sessions")
            navigateur.close()
    finally:
        serveur.terminate()

    resultat["gpuHautePerformance"] = GPU_HAUTE_PERF
    ecrire_json(DOSSIER_RESULTATS / FICHIER, resultat)
    print(f"Adaptateur WebGPU : {resultat['navigateur']['webgpu']}. Résultats : {DOSSIER_RESULTATS / FICHIER}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
