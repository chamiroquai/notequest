# NoteQuest – carnet de donjon

Petite application web pour jouer à **NoteQuest** (jeu solo d'exploration de donjon de Tiago Junges)
sur iPad et iPhone, même sans connexion.

- Pour chaque jet, vous **touchez les faces de vos vrais dés** ou vous demandez un tirage.
- La carte du donjon se dessine toute seule, segment par segment, avec un rendu « fait main ».
- Fiche d'aventurier, combat, journal (avec notes de récit facultatives).
- Sauvegarde automatique sur l'appareil, export et import d'un fichier de partie.

L'application ne prend aucune décision à votre place : elle propose, vous choisissez.

## Les tables ne sont pas incluses

Ce dépôt ne contient pas les tables du livret. Vous gardez votre propre fichier de tables
(par exemple dans iCloud Drive) et vous l'importez dans l'application.
Le format est décrit dans [docs/FORMAT-TABLES.md](docs/FORMAT-TABLES.md) et un modèle vide
est fourni : [tables-modele.json](tables-modele.json).

## Installer sur iPad ou iPhone

1. Ouvrez l'adresse de l'application dans **Safari**.
2. Touchez le bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Lancez NoteQuest depuis l'icône, allez dans **Plus → Importer mon fichier de tables** et choisissez votre fichier.

## Crédits

NoteQuest est un jeu de Tiago Junges (coisinhaverde.com.br), traduit en français par Caelgrim.
Ce carnet est un projet personnel non officiel. Dessin à la main : [Rough.js](https://roughjs.com) (licence MIT, `js/rough.LICENSE.txt`).
