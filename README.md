# gian-g3dai.github.io

Personal blog built with [Astro](https://astro.build), deployed to GitHub Pages.

## First-time setup

```bash
npm install        # generates package-lock.json — commit it
npm run dev        # preview at http://localhost:4321
```

## Deploy

1. Create a GitHub repo named exactly **`gian-g3dai.github.io`**.
2. Push this folder to the `main` branch:
   ```bash
   git init
   git add -A
   git commit -m "Initial blog"
   git branch -M main
   git remote add origin https://github.com/gian-g3dai/gian-g3dai.github.io.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Source → GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) builds and publishes on
   every push. Your site goes live at https://gian-g3dai.github.io.

## Writing a post

Add a Markdown (or `.mdx`) file to `src/content/blog/`. The filename becomes the
URL slug. Required frontmatter:

```markdown
---
title: "Your title"
description: "One or two sentences — this shows in the list, RSS, and previews."
pubDate: 2026-07-01
tags: ["distributed training", "gpu"]
---

Your post body in Markdown.
```

Commit and push — the site rebuilds automatically. That's it.

## Wiring posts onto your GitHub profile

Once the site is live, your feed is at `https://gian-g3dai.github.io/rss.xml`.
Point the `blog-post-workflow` GitHub Action (in your **profile** repo,
`gian-g3dai/gian-g3dai`) at that URL and new posts will appear in the
"Writing" section of your profile automatically.

## Structure

```
src/
├── components/   BaseHead, Header, Footer, PostMeta
├── layouts/      Base, Post
├── content/blog/ your posts (Markdown / MDX)
├── pages/        index, about, blog/, rss.xml.js
└── styles/       global.css (design tokens live here)
```

To retheme, edit the CSS variables at the top of `src/styles/global.css`.
