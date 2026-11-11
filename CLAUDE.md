# Working rules for the site builder

A universal editor for landing pages: one admin manages many sites from a
dashboard and edits each page live in place (blocks, menu, pages, theme). See
README.md for how it works. Not deployed anywhere yet.

## Talking to the owner

- Reply in Slovak. Code, comments, commit messages and PR descriptions stay in English.
- **CAP** means "commit and push": the approval to commit and push what was
  just shown. Do not commit or push without it.
- The main branch is `main`. Pushing does not deploy.

## Stack

- Cloudflare Pages (static `public/`), Pages Functions with Hono
  (`functions/api/[[route]].js`), D1 for data, R2 for uploaded media. No build
  step: plain HTML/CSS/JS and ES modules in the browser.
- `public/assets/js/site.js` renders a page from its JSON blocks
  (`pages.content_json`); `editor.js` is loaded only for a signed-in admin and
  adds the editing UI on top without changing site.js's rendering.
- Block types: `hero_slider`, `text` (1–4 columns), `image`, `gallery`. A new
  block type needs a renderer in site.js and an editor in editor.js.

## Local development

- `npm run dev` (http://localhost:8789) runs `scripts/dev-node.mjs`, a Node
  shim that serves the same Hono router with D1/R2 replaced by `node:sqlite`
  and files, because `wrangler pages dev` crashes on Windows ("write EOF").
- The shim imports the API once at start: restart it after changing
  `functions/`. Static files reload on every request.
- `npm run dev:reset` wipes the local database and media and seeds the demo
  site. Ask before running it.
- Test file uploads with a Node script (`fetch` + `FormData`), not `curl -F`.
- Schema changes go into a new file in `migrations/`; never edit one that has
  already been applied to a remote database.
