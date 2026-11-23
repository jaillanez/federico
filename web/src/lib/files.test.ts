import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileProblem, formatSize, MB } from './files.ts';

test('fileProblem accepts invoices and photos', () => {
  assert.equal(fileProblem({ name: 'factura.pdf', type: 'application/pdf', size: 200_000 }), null);
  assert.equal(fileProblem({ name: 'IMG_0001.HEIC', type: '', size: 3 * MB }), null);
  assert.equal(fileProblem({ name: 'foto', type: 'image/jpeg', size: 1 }), null);
});

test('fileProblem rejects other types, empty and >15 MB files', () => {
  assert.match(fileProblem({ name: 'virus.exe', type: 'application/x-msdownload', size: 10 }) ?? '', /no es un PDF/);
  assert.match(fileProblem({ name: 'f.pdf', type: 'application/pdf', size: 16 * MB }) ?? '', /15 MB/);
  assert.match(fileProblem({ name: 'f.pdf', type: 'application/pdf', size: 0 }) ?? '', /vacío/);
});

test('formatSize', () => {
  assert.equal(formatSize(2.5 * MB), '2,5 MB');
  assert.equal(formatSize(300), '1 KB');
});
