# Mes Dépenses — PWA offline-first

Application web de suivi de dépenses personnelles : **100% locale, installable sur mobile, et fonctionnelle hors-ligne**.

Aucun serveur, aucune API tierce : tout est stocké sur l'appareil (IndexedDB) et l'application se met en cache via un Service Worker après le premier chargement. Le scan de tickets utilise l'OCR **entièrement dans le navigateur** (Tesseract.js).

![Stack](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![PWA](https://img.shields.io/badge/PWA-offline--first-a855f7)

---

## Fonctionnalités

- 📷 **Scan de tickets** — OCR local (Tesseract.js) + parser regex : extrait marchand, date, montant total. Formulaire pré-rempli et corrigible.
- ⚡ **Ajout manuel rapide** — moins de 15 s pour enregistrer une dépense (virements, abonnements, achats en ligne).
- 🏷️ **Catégorisation intelligente** — 9 catégories par défaut + catégories personnalisées. Suggestion auto basée sur le marchand (≈120 enseignes) + **apprentissage local** : l'app retient la catégorie que vous attribuez à un marchand.
- 📊 **Dashboards** — total mensuel + comparaison au mois précédent, camembert par catégorie, évolution sur 6 mois, résumé hebdomadaire textuel.
- 🎯 **Budgets** — global ou par catégorie, avec barres de progression dynamiques (vert → orange → rouge).
- 🔁 **Détection d'abonnements** — repère les dépenses récurrentes (même marchand, même montant, intervalle régulier) et estime les prélèvements à venir.
- 🔐 **Souveraineté des données** — export CSV (filtré), sauvegarde/restauration JSON complète pour transférer ses données entre appareils.
- 🌙 **Mode sombre** — clair, sombre ou adaptatif (selon le système).
- 📱 **Installable** — ajoutez-la à votre écran d'accueil, elle se comporte comme une app native.

---

## Stack technique

| Domaine | Choix |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 |
| Styles | Tailwind CSS 3 |
| PWA | vite-plugin-pwa (Workbox) |
| Base de données | IndexedDB via `idb` |
| Graphiques | Recharts |
| OCR | Tesseract.js (modèle `fra.traineddata` local) |
| Icônes | lucide-react |

> ⚠️ Le paquet `@vite-pwa/plugin` n'existe pas sur npm. Le paquet officiel est **`vite-plugin-pwa`** (utilisé ici).

---

## Lancer l'application

### Prérequis
- [Node.js](https://nodejs.org/) **20+** (testé avec Node 22)
- npm (fourni avec Node)

### Installation
```bash
cd "aplication de dépense"
npm install
```

### Mode développement
```bash
npm run dev
```
Ouvrir **http://localhost:5173/**.
> En mode dev, le Service Worker est activé (`devOptions.enabled`) pour tester le hors-ligne.

### Build de production + aperçu local
```bash
npm run build      # compile dans dist/
npm run preview    # sert le build sur http://localhost:4173/
```
**C'est le mode recommandé pour tester le hors-ligne de façon réaliste** (Service Worker de production).

### Vérification des types
```bash
npm run typecheck  # tsc -b --noEmit
```

---

## 🧪 Procédure de test complète (Étape 5)

### 1. Premier lancement & initialisation

1. `npm run build && npm run preview`
2. Ouvrir http://localhost:4173/
3. **Attendre le splash « Chargement… »** puis l'apparition du tableau de bord.
   - ✓ IndexedDB s'initialise, les **9 catégories par défaut** sont créées.
   - ✓ Le Service Worker s'enregistre (vérifier dans DevTools → **Application → Service Workers** : statut *activated*).

### 2. Vérifier la PWA & le Service Worker

Dans DevTools (F12) → onglet **Application** :

| Élément | Où vérifier | Attendu |
|---|---|---|
| Service Worker | Application → Service Workers | *activated and is running* |
| Manifest | Application → Manifest | nom « Mes Dépenses », 3 icônes |
| Cache precache | Application → Cache Storage | `workbox-precache-v2-...` avec ~17 entrées |
| Installable | barre d'adresse (icône ⬆️ installer) | bouton « Installer » visible |

> **Installer la PWA** : cliquer sur l'icône d'installation dans la barre d'adresse (ou *Application → Install*). L'app s'ouvre en mode *standalone* (sans barre du navigateur).

### 3. Tester le mode hors-ligne (offline)

**Méthode DevTools (recommandée) :**
1. Charger l'app complètement (attendre que le SW s'active).
2. DevTools → **Application → Service Workers** → cocher **Offline**.
   - *ou* DevTools → **Network** → dérouler *Throttling* → **Offline**.
3. Recharger la page (F5).

✓ L'app se recharge **sans réseau** grâce au cache du Service Worker.
✓ Les données (dépenses, catégories) restent accessibles : elles sont en IndexedDB.
✓ Un bandeau ambre **« Mode hors-ligne »** s'affiche en haut.

**Test du scan OCR hors-ligne :**
1. En ligne, faire un 1er scan (le modèle `fra.traineddata` est mis en cache par Workbox).
2. Passer Offline.
3. Refaire un scan → ✓ l'OCR fonctionne sans réseau (modèle en cache local).

> **Important** : `fra.traineddata` (~1,1 Mo) n'est **pas** dans le precache (trop gros) mais est mis en cache au runtime (`CacheFirst`, 1 an) dès le 1er scan. Il faut donc faire un scan en ligne **une première fois** avant de tester l'OCR hors-ligne.

### 4. Tester le scan de ticket (OCR)

1. Onglet **Ajouter** (bouton + central).
2. Cliquer **« Scanner un ticket »** (ouvre l'appareil photo sur mobile / un sélecteur de fichier sur desktop).
3. Choisir une photo de ticket de caisse lisible.
4. Suivre la progression OCR (barre de chargement).
5. ✓ Le formulaire se pré-remplit : **marchand**, **date**, **montant** + badges de confiance verts.
6. La catégorie est suggérée automatiquement (ex. *Carrefour* → *Alimentation*).
7. Corriger si besoin, puis **Enregistrer**.

> Pas de ticket sous la main ? Sur desktop, importez n'importe quelle image contenant du texte pour valider le pipeline OCR.

### 5. Tester l'apprentissage de catégorie

1. Ajouter une dépense « *Pharmacie du Centre* » → l'app suggère *Santé* (mapping intégré).
2. La re-catégoriser manuellement en *Autre*, puis enregistrer.
3. Ajouter une nouvelle dépense « *Pharmacie du Centre* » → l'app propose désormais **Autre** (règle apprise prioritaire).

### 6. Tester les budgets

1. Onglet **Budgets** → **+**.
2. Créer un budget *global* de 50 € (ou *par catégorie*).
3. Ajouter quelques dépenses pour atteindre 80 % → barre **orange** (warning).
4. Dépasser le budget → barre **rouge** + message « Budget dépassé de X € ».

### 7. Tester la détection d'abonnements

1. Ajouter 2–3 dépenses « *Netflix* » à 13,49 € à ~30 jours d'intervalle (dates espacées régulièrement).
2. Elles apparaissent dans **Abonnements** (raccourci du Dashboard).
3. ✓ Estimation mensuelle calculée + prochaine échéance estimée.

### 8. Tester l'export / import de données

**Export CSV** (depuis l'Historique) :
1. Onglet **Historique** → icône ⬇️.
2. ✓ Un fichier `depenses-AAAA-MM-JJ.csv` est téléchargé (compatible Excel FR, BOM UTF-8).

**Sauvegarde JSON** (depuis Réglages) :
1. **Réglages → Exporter une sauvegarde (JSON)** → télécharge `mes-depenses-sauvegarde-AAAA-MM-JJ.json`.
2. **Réinitialiser toutes les données** (avec confirmation).
3. **Importer une sauvegarde (JSON)** → sélectionner le fichier précédent.
4. ✓ Toutes les données sont restaurées.

### 9. Tester le mode sombre

1. Icône soleil/lune en haut à droite → bascule instantanée.
2. **Réglages → Apparence** : tester les 3 modes (Clair / Sombre / Auto).
3. ✓ En mode *Auto*, l'app suit `prefers-color-scheme` du système.

---

## Déploiement

### GitHub Pages (automatique)

Un workflow `.github/workflows/deploy.yml` compile et publie sur GitHub Pages à chaque push sur `main`.

⚠️ **Important** : GitHub Pages sert le site sous `https://<user>.github.io/<repo>/`. Il faut donc définir la `base` Vite :

```bash
# Avant le build, définir le nom du repo comme base :
VITE_BASE_PATH=/nom-du-repo npm run build
```

Le `vite.config.ts` lit `VITE_BASE_PATH` automatiquement. Pour un déploiement à la racine d'un domaine (ou en local), laisser vide.

### Autres hébergeurs statiques

Le dossier `dist/` (généré par `npm run build`) est statique et peut être déployé sur :
- Netlify, Vercel, Cloudflare Pages
- N'importe quel serveur HTTP (nginx, Apache…)

> Le serveur **doit** servir avec les bons en-têtes : le SW nécessite que `sw.js` ne soit pas mis en cache navigateur.

---

## Structure du projet

```
src/
├── components/         UI réutilisable (Icon, ui, Layout, Charts)
├── hooks/              State & logique (useStore, useNavigation, useTheme)
├── lib/                Logique pure (db, ocr, parser, categories, format, export…)
├── pages/              Une page par route (Dashboard, Add, History, Budgets, Recurring, Settings)
├── types/              Définitions TypeScript des entités
├── App.tsx             Racine : routing + providers
├── main.tsx            Point d'entrée React
└── index.css           Tailwind + composants (btn, card, input…)

public/
├── icons/              Icônes PWA (192, 512, maskable)
└── tessdata/           Assets OCR (worker, core WASM, fra.traineddata) — offline
```

## Données & confidentialité

- **Zéro réseau** après le 1er chargement. Aucune donnée n'est envoyée à un serveur.
- Tout est stocké dans **IndexedDB** (navigateur).
- Les images de tickets sont compressées (JPEG, qualité 0,7) avant stockage.
- Pour effacer les données : Réglages → Réinitialiser, ou effacer le stockage du site dans les DevTools.

---

## Scripts disponibles

| Commande | Action |
|---|---|
| `npm run dev` | Serveur de développement (HMR) |
| `npm run build` | Build de production (`tsc -b && vite build`) |
| `npm run preview` | Sert le build localement |
| `npm run typecheck` | Vérification des types sans générer de fichiers |
