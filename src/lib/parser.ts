/**
 * Parser de tickets de caisse.
 *
 * Transforme le texte brut issu de l'OCR en données structurées :
 *  - Marchand (premières lignes textuelles significatives)
 *  - Date (formats DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, etc.)
 *  - Montant total (mots-clés : TOTAL, NET A PAYER, TTC, EUR, €)
 *
 * Conçu pour les tickets français. Les regex tolèrent les erreurs courantes d'OCR
 * (O/0, l/1, espaces, ponctuation).
 */

export interface ParsedReceipt {
  /** Nom du marchand détecté, ou null. */
  merchant: string | null
  /** Date au format ISO (YYYY-MM-DD), ou null si non détectée. */
  date: string | null
  /** Montant total en euros, ou null si non détecté. */
  amount: number | null
  /** Texte brut utilisé pour le parsing (pour debug/affichage). */
  rawText: string
}

/** Nettoie une ligne : supprime espaces multiples et caractères parasites. */
function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

/**
 * Extrait le nom du marchand : on prend les premières lignes non vides
 * qui ressemblent à un nom (lettres majoritairement, pas trop long).
 */
function parseMerchant(lines: string[]): string | null {
  const candidates: string[] = []
  for (const raw of lines.slice(0, 6)) {
    const line = cleanLine(raw)
    if (!line) continue
    // Saute les lignes qui sont manifestement des en-têtes inutiles.
    if (/^(ticket|facture|receipt|www\.|http|tél|tel:|siret|siren|tva|ape)/i.test(line)) {
      continue
    }
    // Compte les lettres vs chiffres : un nom de magasin a surtout des lettres.
    const letters = (line.match(/[a-zA-Zà-ÿ]/g) ?? []).length
    const digits = (line.match(/[0-9]/g) ?? []).length
    if (letters >= 3 && letters >= digits && line.length <= 40) {
      candidates.push(line)
    }
    if (candidates.length >= 1 && line.length <= 40) {
      // On prend la première ligne plausible.
      break
    }
  }
  return candidates[0] ?? null
}

/**
 * Convertit une date FR (DD/MM/YYYY) en ISO (YYYY-MM-DD).
 * Gère aussi les années sur 2 chiffres (20xx).
 */
function toISODate(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10)
  const m = parseInt(month, 10)
  let y = parseInt(year, 10)
  if (!d || !m || !y) return null
  if (d < 1 || d > 31 || m < 1 || m > 12) return null
  if (y < 100) y += 2000
  if (y < 1900 || y > 2100) return null
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/** Extrait la date depuis le texte (plusieurs formats français). */
function parseDate(text: string): string | null {
  // Format DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (année 2 ou 4 chiffres)
  const dateRegex = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g
  let match: RegExpExecArray | null
  while ((match = dateRegex.exec(text)) !== null) {
    // Priorité au format français (jour/mois), repli sur le format US (mois/jour).
    const fr = toISODate(match[1], match[2], match[3])
    if (fr) return fr
    const us = toISODate(match[2], match[1], match[3])
    if (us) return us
  }
  return null
}

/**
 * Normalise un montant potentiel :
 * "12,99" / "12.99" / "1 299,00" / "12.990" -> number.
 * Gère l'ambiguïté : en FR, la virgule est le séparateur décimal.
 */
function parseAmount(raw: string): number | null {
  let s = raw
    .replace(/[€eur\s]+/gi, '')   // symboles et unités
    .replace(/\s/g, '')            // espaces insécables
    .replace(/[^\d.,]/g, '')       // garde chiffres, virgule, point

  // Cas "1.234,56" ou "1 234.56" : dernier séparateur = décimal.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastComma > lastDot) {
    // Virgule décimale : on retire les points (séparateurs de milliers).
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > -1 && lastDot > lastComma) {
    // Point décimal : on retire les virgules (milliers).
    s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    // Seulement une virgule -> décimale.
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Extrait le montant total en cherchant des mots-clés près d'un nombre.
 * Ordre de priorité : NET A PAYER > TOTAL (général) > TTC > dernier montant > €/EUR.
 */
function parseAmountByKeyword(text: string): number | null {
  const normalizedText = text
    .replace(/[\u00A0\u202F]/g, ' ') // espaces insécables -> espace normal

  // Paires (libellé de priorité, regex). On cherche le mot-clé puis un montant
  // sur la même ligne ou juste après.
  const keywords: [string, RegExp][] = [
    // "NET A PAYER" / "NET À PAYER" suivi d'un montant (même ligne)
    ['net', /net\s*[aà]\s*payer[:\s]*([0-9][0-9\s.,]*\s?(?:€|eur)?)/i],
    // "TOTAL" suivi d'un montant
    ['total', /total\s*(?:g[eé]n[eé]ral)?[:\s]*([0-9][0-9\s.,]*\s?(?:€|eur)?)/i],
    // "TTC" suivi d'un montant
    ['ttc', /\bttc[:\s]*([0-9][0-9\s.,]*\s?(?:€|eur)?)/i],
    // "MONTANT" / "A PAYER" / "À PAYER"
    ['montant', /(?:montant|[aà]\s*payer)[:\s]*([0-9][0-9\s.,]*\s?(?:€|eur)?)/i],
  ]

  for (const [, regex] of keywords) {
    const m = normalizedText.match(regex)
    if (m?.[1]) {
      const amount = parseAmount(m[1])
      if (amount !== null && amount > 0) return amount
    }
  }

  // Repli : le plus grand montant trouvé sur une ligne contenant € ou EUR,
  // ou simplement le plus grand montant du ticket.
  const euroLines = normalizedText
    .split('\n')
    .filter((l) => /[€]|eur/i.test(l))
  const allAmounts: number[] = []
  for (const line of euroLines) {
    for (const m of line.matchAll(/([0-9][0-9\s.,]*)\s?(?:€|eur)/gi)) {
      const a = parseAmount(m[1])
      if (a !== null) allAmounts.push(a)
    }
  }
  if (allAmounts.length) return Math.max(...allAmounts)

  // Dernier repli : tous les montants du texte, on prend le plus élevé plausible.
  const everyAmount = [...text.matchAll(/([0-9]+[.,][0-9]{2})/g)]
    .map((m) => parseAmount(m[1]))
    .filter((a): a is number => a !== null && a > 0)
  if (everyAmount.length) return Math.max(...everyAmount)

  return null
}

/** Point d'entrée : parse un texte OCR en données structurées. */
export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n')
  return {
    merchant: parseMerchant(lines),
    date: parseDate(rawText),
    amount: parseAmountByKeyword(rawText),
    rawText,
  }
}
