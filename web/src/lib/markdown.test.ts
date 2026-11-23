import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.ts';

test('markdown: headings get unique ids and build the TOC (h2/h3 only)', () => {
  const { html, toc } = renderMarkdown('# Título\n\n## Qué es tg φ\n\n### Detalle\n\n## Qué es tg φ');
  assert.deepEqual(
    toc.map((t) => [t.id, t.depth]),
    [
      ['titulo', 2],
      ['que-es-tg', 2],
      ['detalle', 3],
      ['que-es-tg-2', 2],
    ],
  );
  assert.match(html, /<h2 id="titulo">Título<\/h2>/); // h1 demoted
  assert.doesNotMatch(html, /<h1/);
});

test('markdown: raw HTML is escaped, never executed', () => {
  const { html } = renderMarkdown('Hola <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('markdown: javascript: links are neutralized; external links open safely', () => {
  const { html } = renderMarkdown('[mal](javascript:alert(1)) [bien](https://example.com) [interno](/obras)');
  assert.match(html, /<a href="#">mal<\/a>/);
  assert.match(html, /<a href="https:\/\/example.com" rel="noopener" target="_blank">bien<\/a>/);
  assert.match(html, /<a href="\/obras">interno<\/a>/);
});
