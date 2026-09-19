import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Your GitHub Pages user-site URL. Because the repo is named
  // gian-g3dai.github.io, no `base` is needed.
  site: 'https://gian-g3dai.github.io',
  integrations: [mdx(), sitemap()],
  // The cross-entropy post was folded into the broader end-to-end write-up.
  // Keep the old URL alive so existing links don't 404.
  redirects: {
    '/blog/memory-efficient-cross-entropy': '/blog/training-a-code-model-end-to-end',
  },
});
