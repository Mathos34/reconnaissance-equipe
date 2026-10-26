# Post LinkedIn : brouillon

À compléter avant publication : nom du cours, nom de l'enseignant (à identifier dans le post). Celui ou celle qui publie retire son propre nom de la liste de l'équipe.

Pièce jointe conseillée : `presentation/Maison-Test-client-recognition.pdf` (version anglaise), publiée comme document LinkedIn (les diapositives défilent comme un carrousel). Sinon, une capture de la page Reconnaissance avec le visage pixélisé (`presentation/images/reconnaissance.png`).

---

Peut-on reconnaître un client à l'entrée d'une boutique avec une simple webcam et un navigateur ? Techniquement, oui. C'est justement ce qui rend la question intéressante.

Dans le cadre du cours [nom du cours] à Audencia, avec Rim Middi, Felix Chevalier, Jean-Baptiste Caron et Mathis Lacombe, nous avons construit Maison Test : le prototype d'une boutique de luxe fictive où le conseiller voit la fiche du client dès qu'il entre dans le champ de la caméra. Préférences, derniers achats, et une phrase d'accueil du type « Bonjour Madame Test, un café glacé sans sucre, comme d'habitude ? ».

Ce que nous en retenons :

1. L'IA est devenue très accessible. Deux modèles open source de 15 Mo tournent directement dans le navigateur, sans serveur : 0,2 seconde entre l'apparition du visage et l'affichage de la fiche.

2. Mesurer change les conclusions. Nous pensions que la carte graphique accélérerait tout. Les mesures ont montré l'inverse pour une partie du calcul, et le réglage final vient des chiffres, pas de l'intuition.

3. Les vraies limites ne sont pas techniques. Au-delà de 2 mètres, avec un flou fort ou un visage à moitié masqué, la reconnaissance décroche, mais cela se règle avec une caméra bien placée. Le frein principal est ailleurs : un visage est une donnée biométrique (RGPD, AI Act), le consentement doit être réel, et dans le luxe, être reconnu sans l'avoir demandé peut vite ressembler à de la surveillance.

Notre conclusion : un concept faisable, à encadrer avant d'être déployé. Ce projet nous a fait travailler autant la mesure, le droit et le produit que l'IA elle-même.

Le prototype est en ligne avec des données fictives, et le code est public :
Démo : https://mathos34.github.io/reconnaissance-equipe/
Code : https://github.com/Mathos34/reconnaissance-equipe

Merci à [nom de l'enseignant] pour l'accompagnement.

#Audencia #IntelligenceArtificielle #Retail #RGPD
