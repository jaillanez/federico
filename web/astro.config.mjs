// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/** Registers /estilos (component catalog) only while running `astro dev`. */
const devOnlyStyleGuide = {
  name: 'sei-dev-style-guide',
  hooks: {
    /** @param {{ command: string, injectRoute: (r: { pattern: string, entrypoint: string }) => void }} opts */
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({ pattern: '/estilos', entrypoint: './src/dev/estilos.astro' });
      }
    },
  },
};

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:8080',
  output: 'static',
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  build: { format: 'file' },
  integrations: [preact(), sitemap({ filter: (page) => !page.includes('/admin') }), devOnlyStyleGuide],
  vite: { plugins: [tailwindcss()] },
});
