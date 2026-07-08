# Suivi de Dépenses — PWA offline-first

Application web de suivi de dépenses personnelles : **100% locale, installable sur mobile, ouvrable dans Firefox, et fonctionnelle hors connexion**.

Aucun serveur, aucune API tierce : tout est stocké sur l'appareil (IndexedDB) et l'application se met en cache via un Service Worker après le premier chargement.

---

## Lancer l'application

### Prérequis
- [Node.js](https://nodejs.org/) 18 ou plus
- npm (fourni avec Node)

### Installation
```bash
cd "aplication de dépense"
npm install
```

### Mode développement (Firefox)
```bash
npm run dev
```
Ouvrir **http://localhost:5173/** dans Firefox.
> En mode dev, le Service Worker est activé (`devOptions.enabled`) pour pouvoir tester le hors-ligne.

### Build de production + serveur local
```bash
npm run build      # compile dans dist/
npm run preview    # sert le build sur http://localhost:4173/
```
**C'est le mode recommandé pour tester le hors-ligne de façon réaliste** (Service Worker de production).

---

## Tester le mode hors-ligne (offline)

### Méthode 1 — DevTools Firefox (le plus simple)
1. Ouvrir l'app dans Firefox, attendre le chargement complet.
2. Appuyer sur `F12` → onglet **Network**.
3. Cocher **Offline**.
4. Recharger la page (`Cmd/Ctrl + R`).
5. ✅ La page s'affiche quand même : le Service Worker sert la version cachée.
6. Tester l'ajout d'une dépense, la consultation de l'historique, etc. : tout fonctionne sans réseau.

### Méthode 2 — Déconnecter le réseau
Couper le Wi-Fi / retirer le câble, puis recharger. L'app reste pleinement fonctionnelle.

### Vérifier le Service Worker
- DevTools (`F12`) → onglet **Application** (ou **Storage**) → **Service Workers** : `sw.js` doit apparaître avec le statut *activated and running*.
- Toujours dans **Application** → **Cache Storage** : on doit voir le cache `workbox-precache-v2-...` contenant ~26 entrées (HTML, JS, CSS, icônes, WASM OCR, langue française).

---

## Installer l'application (PWA)

### Sur ordinateur — Firefox
Firefox desktop ne propose pas l'« installation » d'une PWA comme Chrome.
Pour une vraie app fenêtrée, utiliser **Chrome / Edge / Brave** :
- Icône d'installation à droite de la barre d'adresse, ou menu `⋮` → **Installer**.
> L'app reste néanmoins **100% hors-ligne dans Firefox** ; seule l'installation « native » n'est pas offerte par Firefox desktop.

### Sur mobile
| Navigateur | Installation | Hors-ligne |
|---|---|---|
| **Chrome / Samsung Internet** (Android) | ✅ Menu `⋮` → **Installer l'application** | ✅ |
| **Safari** (iOS 16.4+) | ✅ Bouton Partager → **Sur l'écran d'accueil** | ✅ |
| **Firefox** (Android) | ❌ (Mozilla a retiré l'installation) | ✅ hors-ligne |

**Important pour mobile** : l'app doit être servie en **HTTPS** ou en **localhost**. Pour tester sur le téléphone, soit déployer (voir ci-dessous), soit utiliser `npm run preview -- --host` et ouvrir `http://<IP-du-PC>:4173/` (même réseau Wi-Fi).

---

## Déployer en ligne (accès mobile)

L'app étant 100% statique, n'importe quel hébergeur de fichiers statiques convient :

**Netlify / Vercel / Cloudflare Pages** (drag-and-drop du dossier `dist/`).

**GitHub Pages** :
```bash
npm run build
# publier le contenu de dist/ sur la branche gh-pages
```
⚠️ Si l'app n'est pas servie à la racine d'un domaine, ajuster `base` dans `vite.config.ts` (ex: `base: '/mon-repo/'`).

---

## Fonctionnalités

- **Scan de tickets** par OCR (Tesseract.js, 100% local) → extraction auto du marchand, de la date et du total
- **Ajout manuel** rapide (objectif < 15 s)
- **Catégorisation intelligente** : suggestion auto par marchand + apprentissage local (l'app retient vos corrections)
- **Catégories personnalisées** (créer / supprimer)
- **Dashboard** : total du mois, comparaison vs mois précédent, résumé hebdomadaire, graphiques
- **Graphiques** : répartition par catégorie (camembert) + évolution sur 6 mois (barres)
- **Budgets** : global ou par catégorie, avec barres vert → orange → rouge
- **Historique** filtrable (recherche, catégorie, tri) + export **CSV**
- **Détection des abonnements** / dépenses récurrentes
- **Mode sombre** (manuel ou adaptatif)
- **Souveraineté des données** : export / import **JSON** complet pour transférer d'un appareil à l'autre

---

## Architecture technique

| Couche | Techno |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styles | Tailwind CSS v4 |
| PWA | `vite-plugin-pwa` (Workbox) |
| Stockage | IndexedDB (lib `idb`) |
| Graphiques | Recharts |
| OCR | Tesseract.js (langue FR servie en local) |
| Icônes | lucide-react |

```
src/
├── components/   UI réutilisable (boutons, cartes, graphiques, layout)
├── pages/        Dashboard, AddPage, HistoryPage, BudgetsPage, SettingsPage
├── hooks/        useStore, useTheme, useNavigation
├── lib/          db.ts, ocr.ts, parser.ts, categories.ts, format.ts, export.ts
└── types/        Types TypeScript
public/tessdata/  Assets OCR offline (WASM + langue FR + worker)
```

---

## Dépannage

**L'OCR est lent au premier scan** — Normal : le worker Tesseract charge le moteur WASM (~3 Mo) et la langue française (~1 Mo) la première fois. Les scans suivants sont rapides (le worker est réutilisé).

**Le mode hors-ligne ne marche pas en dev** — Vérifier dans DevTools → Application → Service Workers que `dev-sw.js` est bien *activated*. En cas de doute, cliquer **Unregister** puis recharger.

**Firefox Android : pas d'installation** — C'est un choix de Mozilla (depuis Firefox 79). L'app fonctionne quand même hors-ligne ; pour l'installation native sur Android, utiliser Chrome ou Samsung Internet.

**Réinitialiser complètement** — Dans l'app : Réglages → « Tout effacer ». Ou DevTools → Application → Storage → **Clear site data**.
