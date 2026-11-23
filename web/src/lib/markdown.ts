/**
 * Article Markdown → HTML at build time. Raw HTML in the source is escaped (never executed),
 * headings get ids for the table of contents, and the article's own h1 is demoted to h2
 * (the page already has one h1).
 */
import { Marked, type Tokens } from 'marked';
import { slugify } from './format.ts';

export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderMarkdown(source: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Heading['tokens']) => string } }, token: Tokens.Heading) {
        const depth = Math.min(6, Math.max(2, token.depth));
        const text = token.text.replace(/<[^>]*>/g, '');
        const base = slugify(text) || 'seccion';
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n + 1}` : base;
        if (depth === 2 || depth === 3) toc.push({ id, text, depth });
        return `<h${depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${depth}>\n`;
      },
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
      link(this: { parser: { parseInline: (t: Tokens.Link['tokens']) => string } }, token: Tokens.Link) {
        const href = token.href.trim();
        const safe = /^(https?:|mailto:|tel:|\/|#)/i.test(href) ? href : '#';
        const external = /^https?:/i.test(safe);
        const attrs = external ? ' rel="noopener" target="_blank"' : '';
        return `<a href="${escapeHtml(safe)}"${attrs}>${this.parser.parseInline(token.tokens)}</a>`;
      },
    },
  });

  const html = marked.parse(source, { async: false });
  return { html, toc };
}
