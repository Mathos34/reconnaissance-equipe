// Accès à la caméra du navigateur. L'autorisation est demandée à l'utilisateur, jamais en arrière-plan.

/**
 * Démarre la caméra dans l'élément <video>. Renvoie une fonction qui arrête le flux.
 * Lève une erreur lisible si l'accès est refusé ou si aucune caméra n'est disponible.
 */
export async function ouvrirCamera(video, { largeur = 1280, hauteur = 720 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ce navigateur ne donne pas accès à la caméra (HTTPS requis).");
  }
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: largeur }, height: { ideal: hauteur }, facingMode: "user" },
      audio: false,
    });
  } catch (erreur) {
    if (erreur.name === "NotAllowedError") throw new Error("Accès à la caméra refusé. Autorisez-la dans le navigateur.");
    if (erreur.name === "NotFoundError") throw new Error("Aucune caméra détectée sur cet appareil.");
    throw new Error(`Caméra indisponible : ${erreur.message}`);
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = flux;
  await video.play();
  return () => flux.getTracks().forEach((piste) => piste.stop());
}
