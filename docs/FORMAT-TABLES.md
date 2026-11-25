# Format du fichier de tables

L'application ne contient **aucune table du livret**. Vous lui donnez votre propre fichier
(par exemple `mes-tables.json`, rangé dans iCloud Drive), via **Plus → Importer mon fichier de tables**.
L'application en garde une copie sur l'appareil ; il suffit de l'importer une fois par appareil
(et à nouveau si vous modifiez le fichier).

Point de départ : [`tables-modele.json`](../tables-modele.json), qui a la bonne forme mais des textes vides.

## Structure générale

```json
{
  "format": "notequest-tables",
  "version": 1,
  "description": "Mes tables",
  "tables": {
    "porte": { "titre": "Porte", "de": "1d6", "entrees": [ { "jet": 1, "texte": "…" } ] }
  }
}
```

- `format` doit valoir exactement `notequest-tables`.
- `de` : les dés à lancer pour cette table (`1d6`, `2d6`…).
- `entrees` : une ligne par résultat. `jet` est un nombre (`7`) ou un intervalle (`"11-12"`).
- `texte` : ce qui s'affiche. `nom` (facultatif) : nom court, utilisé pour le sac, les sorts, etc.

Certaines tables ont **plusieurs colonnes** (selon le type de donjon ou le segment de départ).
Elles utilisent `colonnes` à la place de `entrees` :

```json
"monstres": {
  "titre": "Monstres", "de": "2d6",
  "colonnes": {
    "groupe_1": { "titre": "…", "entrees": [ … ] },
    "groupe_2": { "titre": "…", "entrees": [ … ] }
  }
}
```

Les identifiants de colonnes (`groupe_1`…) sont libres : ils doivent seulement correspondre
au champ `groupe` des entrées de `types_donjon`.

## Les tables et leurs champs utiles

Les champs entre crochets sont facultatifs : sans eux, l'application vous pose simplement la question.

| Identifiant | Dés | Champs spéciaux |
|---|---|---|
| `races` | 2d6 | `nom`, `pv` (points de vie) |
| `classes` | 2d6 | `nom`, `pv` (bonus de PV), `arme` (ex. `Épée (1d6 dégâts)`) |
| `sorts` | 1d6 | `nom` |
| `types_donjon` | 1d6 | `nom`, `groupe` (colonne à utiliser), [`depart`] : forme du premier segment (voir « Segment ») |
| `boss` | 1d6, colonnes par groupe | [`nom`, `pv`, `degats`, `capacites`] : ajoutés au combat dans la salle finale |
| `segments` | 1d6, colonnes `escalier`, `couloir`, `piece` | [`segment`] : forme à dessiner |
| `contenu` | 2d6, colonnes par groupe | — |
| `monstres` | 2d6, colonnes par groupe | [`monstres`] : liste de monstres ; [`aucun`: true] pour « pas de monstre » |
| `porte` | 1d6 | [`fermee`: true], [`piege`: true] |
| `piege` | 1d6 | — |
| `coffre` | 1d6 | [`piege`: true] |
| `passage_secret` | 1d6 | [`piege`: true], [`segment`] si un passage s'ouvre |
| `tresor` | 1d6 | `nom` |
| `objet_magique` | 1d6 | `nom` |
| `autres_objets` | 1d6, colonnes `arme`, `armure`, `objet_merveilleux` | `nom`, [`pv`] pour l'armure |

### Segment (`segment` et `depart`)

```json
"segment": { "genre": "piece", "largeur": 4, "longueur": 6, "portes": 2, "secret": true, "piege": false }
```

- `genre` : `couloir`, `piece` ou `escalier`.
- `largeur` × `longueur` : taille en cases. La longueur part de la porte par laquelle on entre.
  Par défaut : couloir 1 × 6 (`"grand": true` → 2 × 8), escalier 1 × 3, pièce 4 × 4.
- `portes` : nombre de portes **en plus** de celle par laquelle on entre.
- `fond` : `true` (par défaut) pour placer une porte au bout ; `false` pour ne mettre des portes que sur les côtés.
- `secret` : le segment peut avoir un passage secret. `piege` : il peut contenir un piège. `piliers` : dessine des piliers.
- `suite` (seulement dans `depart`) : un second segment accroché au bout du premier (ex. un escalier au fond d'un hall).

Un escalier fait descendre d'un niveau. En ouvrant la porte d'un escalier de niveau 3,
l'application vous **propose** la salle finale ; vous pouvez aussi lancer la table normalement.

### Monstres (`monstres`)

```json
"monstres": [ { "nom": "…", "nombre": "1d6", "pv": 4, "degats": 1, "capacites": "…" } ]
```

`nombre` est un chiffre ou une formule de dés : dans ce cas, l'application vous demande de lancer.

## Mémo des règles (facultatif)

L'onglet **Règles** affiche le mémo rangé dans votre fichier, à côté de `tables` :

```json
"memo": {
  "titre": "Mémo des règles",
  "sections": [
    { "titre": "Combat", "points": [ "Première règle à retenir…", "Deuxième…" ] }
  ]
}
```

Chaque section se replie, et un champ de recherche filtre les points.

## Conseils pour iPad et iPhone

- Éditez le fichier avec une app de texte (Textastic, Runestone, ou Notes puis « Enregistrer dans Fichiers »),
  en gardant l'extension `.json`.
- Les guillemets doivent être droits (`"`), pas typographiques (`« »` ou `“ ”`). Désactivez au besoin
  « Ponctuation intelligente » dans Réglages → Général → Clavier.
- Si l'import échoue, l'application indique la table ou le champ en cause.
