import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeEmail, normalizeArPhone } from './phone.ts';

// Same cases as api/tests/test_lead_services.py::test_normalize_ar_phone.
const cases: [string, string | null][] = [
  ['0264 15 5651609', '+5492645651609'],
  ['264-5651609', '+5492645651609'],
  ['+54 9 264 565-1609', '+5492645651609'],
  ['(0264) 155-651609', '+5492645651609'],
  ['11 15 1234-5678', '+5491112345678'],
  ['+5491112345678', '+5491112345678'],
  ['02966 15 123456', '+5492966123456'],
  ['123', null],
  ['0264 4220', null],
  ['+1 202 555 0101', null],
  ['0000000000', null],
];

test('normalizeArPhone matches the API rules', () => {
  for (const [raw, expected] of cases) assert.equal(normalizeArPhone(raw), expected, raw);
});

test('looksLikeEmail', () => {
  assert.ok(looksLikeEmail('ana@empresa.com.ar'));
  assert.ok(!looksLikeEmail('ana@'));
  assert.ok(!looksLikeEmail('ana empresa.com'));
});
