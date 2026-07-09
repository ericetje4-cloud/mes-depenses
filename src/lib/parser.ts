// ===========================================================================
// Parser de tickets de caisse : extraction par regex depuis le texte OCR.
//
// Cible : tickets de supermarché, restaurants, boutiques françaises.
// Extrait : marchand, date, montant total.
// Robuste aux variations de format (erreurs OCR, mises en page variables).
// ===========================================================================

/** Résultat du parsing, tous les champs sont optionnels (extraction best-effort). */
export interface ParsedReceipt {
  /** Nom du marchand détecté. */
  merchant?: string;
  /** Date au format ISO (yyyy-mm-dd), ou undefined si non détectée. */
  date?: string;
  /** Montant total TTC détecté. */
  total?: number;
  /** Indices de confiance bruts (0-1) pour afficher un retour UI. */
  confidence: {
    merchant: number;
    date: number;
    total: number;
  };
  /** Lignes brutes (débarrassées du bruit) pour debug. */
  rawLines: string[];
}

// ---------------------------------------------------------------------------
// Nettoyage du texte OCR
// ---------------------------------------------------------------------------

/**
 * Normalise le texte brut OCR : retire les caractères parasites courants,
 * garde les lignes significatives (>= 2 caractères non-espaces).
 */
function cleanLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.replace(/[^a-zA-Z0-9]/g, '').length >= 2);
}

// ---------------------------------------------------------------------------
// Extraction du MARCHAND
// ---------------------------------------------------------------------------

// Mots vides à ignorer en début/fin de nom de marchand.
const MERCHANT_STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'et', 'the', 'of',
  'tel', 'téléphone', 'telephone', 'fax', 'www', 'http', 'https',
  'siret', 'siren', 'tva', 'euro', 'euros', 'eur',
]);

/**
 * Détection du marchand : les premières lignes textuelles non-numériques
 * constituent généralement l'en-tête (nom de l'enseigne).
 */
function extractMerchant(lines: string[]): { value?: string; confidence: number } {
  // On scanne les 6 premières lignes significatives.
  const head = lines.slice(0, 6);

  const candidates: string[] = [];
  for (const line of head) {
    // Une ligne d'en-tête valide : surtout des lettres, peu de chiffres.
    const letters = (line.match(/[a-zA-Zà-ÿ]/g) ?? []).length;
    const digits = (line.match(/[0-9]/g) ?? []).length;
    if (letters < 3) continue;
    if (digits > letters * 0.5) continue; // trop de chiffres = pas un nom

    // Nettoyage : on garde les mots utiles.
    const words = line
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Zà-ÿ0-9&'-]/g, ''))
      .filter((w) => w.length >= 2 && !MERCHANT_STOPWORDS.has(w.toLowerCase()));

    if (words.length >= 1) {
      candidates.push(words.join(' '));
    }
  }

  if (candidates.length === 0) return { confidence: 0 };

  // Le premier candidat solide (> 2 lettres, pas un nombre) gagne.
  const best =
    candidates.find((c) => c.length >= 3) ?? candidates[0];

  // Capitalisation propre : "Carrefour Market"
  const formatted = best
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    value: formatted,
    confidence: Math.min(0.5 + candidates.length * 0.15, 0.9),
  };
}

// ---------------------------------------------------------------------------
// Extraction de la DATE
// ---------------------------------------------------------------------------

// Capture plusieurs formats de date et les normalise en ISO (yyyy-mm-dd).
const DATE_PATTERNS: { re: RegExp; groupOrder: [string, string, string] }[] = [
  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  {
    re: /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/,
    groupOrder: ['day', 'month', 'year'],
  },
  // YYYY-MM-DD (format ISO déjà)
  {
    re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
    groupOrder: ['year', 'month', 'day'],
  },
  // DD MMM YYYY (ex: 15 JANV 2024) - mois en lettres
  {
    re: /\b(\d{1,2})\s+([a-zA-Zéûôîà]{3,})\.?\s+(\d{2,4})\b/,
    groupOrder: ['day', 'monthName', 'year'],
  },
];

const MONTHS_FR: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1,
  fev: 2, fevr: 2, fevrier: 2, février: 2, fév: 2, févr: 2,
  mar: 3, mars: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6, jun: 6,
  juil: 7, jul: 7, juillet: 7,
  aou: 8, aout: 8, août: 8, aoû: 8,
  sep: 9, sept: 9, septembre: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, decembre: 12, décembre: 12, déc: 12, décemb: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function extractDate(lines: string[]): { value?: string; confidence: number } {
  for (const line of lines) {
    for (const { re, groupOrder } of DATE_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;

      let day: number | undefined;
      let month: number | undefined;
      let year: number | undefined;

      for (let i = 0; i < groupOrder.length; i++) {
        const part = groupOrder[i];
        const raw = m[i + 1];
        if (part === 'day') day = parseInt(raw, 10);
        else if (part === 'month') month = parseInt(raw, 10);
        else if (part === 'year') year = parseInt(raw, 10);
        else if (part === 'monthName') {
          const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          month = MONTHS_FR[key.slice(0, 4)] ?? MONTHS_FR[key];
        }
      }

      if (!day || !month || !year) continue;

      // Complétion de l'année sur 2 digits : 24 -> 2024.
      if (year < 100) year += year < 70 ? 2000 : 1900;

      // Validation basique.
      if (month < 1 || month > 12) continue;
      if (day < 1 || day > 31) continue;
      if (year < 1990 || year > 2100) continue;

      return {
        value: `${year}-${pad2(month)}-${pad2(day)}`,
        confidence: 0.85,
      };
    }
  }
  return { confidence: 0 };
}

// ---------------------------------------------------------------------------
// Extraction du MONTANT TOTAL
// ---------------------------------------------------------------------------

// Mots-clés indiquant le total à payer (prioritaires).
const TOTAL_KEYWORDS = [
  'total ttc', 'total', 'a payer', 'à payer', 'net a payer', 'net à payer',
  'montant ttc', 'total a payer', 'total à payer', 'balance due',
  'carte bancaire', 'cb ', 'ttc', 'eur', 'euros', 'net',
];

/**
 * Parse un montant français : "12,50" ou "12.50" -> 12.5
 */
function parseAmount(raw: string): number | undefined {
  // On accepte virgule ou point comme séparateur décimal.
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const match = cleaned.match(/\d{1,}([.,]\d{1,2})?/);
  if (!match) return undefined;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Extrait le montant total en priorisant les lignes avec mots-clés,
 * puis en cherchant le montant le plus élevé comme repli.
 */
function extractTotal(lines: string[]): { value?: number; confidence: number } {
  // 1. Recherche prioritaire par mots-clés (avec score de priorité).
  let bestMatch: { amount: number; score: number } | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (let i = 0; i < TOTAL_KEYWORDS.length; i++) {
      const kw = TOTAL_KEYWORDS[i];
      if (!lower.includes(kw)) continue;

      // Score : les mots-clés en début de liste sont prioritaires.
      const score = (TOTAL_KEYWORDS.length - i) * 10;

      // On cherche tous les montants sur la ligne, on prend le plus pertinent.
      const amounts = line.match(/\d{1,6}([.,]\d{1,2})?/g) ?? [];
      for (const a of amounts) {
        const n = parseAmount(a);
        if (n === undefined) continue;
        // Un total réaliste : entre 0.01 et 100000.
        if (n < 0.01 || n > 100000) continue;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { amount: n, score };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      value: bestMatch.amount,
      confidence: bestMatch.score >= 30 ? 0.9 : 0.7,
    };
  }

  // 2. Repli : le montant le plus élevé du ticket (souvent le total).
  let maxAmount = 0;
  for (const line of lines) {
    const amounts = line.match(/\d{1,6}([.,]\d{1,2})?/g) ?? [];
    for (const a of amounts) {
      const n = parseAmount(a);
      if (n !== undefined && n > maxAmount && n <= 100000) maxAmount = n;
    }
  }

  if (maxAmount > 0) {
    return { value: maxAmount, confidence: 0.4 };
  }

  return { confidence: 0 };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Parse le texte OCR d'un ticket de caisse et renvoie les champs extraits.
 * Tous les champs sont optionnels : l'UI permet la correction manuelle.
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = cleanLines(rawText);

  const merchant = extractMerchant(lines);
  const date = extractDate(lines);
  const total = extractTotal(lines);

  return {
    merchant: merchant.value,
    date: date.value,
    total: total.value,
    confidence: {
      merchant: merchant.confidence,
      date: date.confidence,
      total: total.confidence,
    },
    rawLines: lines,
  };
}
