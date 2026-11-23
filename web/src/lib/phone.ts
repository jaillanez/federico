/**
 * Argentine phone → E.164 mobile (+549 + 10 digits), same rules as api/app/services/phone.py.
 * Pure function, no imports, unit-tested.
 */
export function normalizeArPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12) {
    // Old mobile format: area code (2-4 digits) + "15" + number.
    for (const areaLen of [2, 3, 4]) {
      if (digits.slice(areaLen, areaLen + 2) === '15') {
        digits = digits.slice(0, areaLen) + digits.slice(areaLen + 2);
        break;
      }
    }
  }
  if (digits.length !== 10 || digits.startsWith('0')) return null;
  return `+549${digits}`;
}

/** Pragmatic email check for instant feedback (the API does the authoritative validation). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
