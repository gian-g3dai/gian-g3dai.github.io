import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Your GitHub Pages user-site URL. Because the repo is named
  // gian-g3dai.github.io, no `base` is needed.
  site: 'https://gian-g3dai.github.io',
  integrations: [mdx(), sitemap()],
});
