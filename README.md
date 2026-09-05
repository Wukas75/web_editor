# Site Builder

Univerzálny web editor na landing pages. Admin si v dashboarde vytvorí ľubovoľný počet
webov a každý z nich potom upravuje **priamo naživo na stránke**: pridáva a presúva bloky
(hero slider, text v 1–4 stĺpcoch, obrázok, fotogaléria), spravuje menu a stránky, a mení
vzhľad cez živý CSS panel (farby, fonty, zaoblenie, vlastné CSS).

Rovnaký stack a princíp ako projekt [podhajska](../web): Cloudflare Pages (statické súbory)
+ Pages Functions s [Hono](https://hono.dev) (`/api/*`) + D1 (dáta) + R2 (nahrané médiá).
Žiadny build krok – čisté HTML/CSS/JS, ES moduly priamo v prehliadači.

## Ako to funguje

- **`/`** – dashboard: prihlásenie, zoznam webov, vytvorenie / zmazanie webu.
- **`/s.html?site=<slug>&page=<slug>`** – verejná stránka. Ak si prihlásený admin, dotiahne
  sa `editor.js` a stránka sa zmení na živý editor (lišta s ↑↓✏🗑 nad každým blokom,
  „+ Pridať blok“, FAB vpravo dole so Stránkami / Menu / Vzhľadom).
- Obsah stránky je pole JSON blokov (`pages.content_json`) – žiadny blok neexistuje mimo
  tohto poľa, takže presun/pridanie/zmazanie je vždy len úprava tohto poľa + uloženie.
- Menu a vzhľad (CSS premenné + vlastné CSS) sú per-web, zdieľané naprieč všetkými
  stránkami daného webu.

## Vývoj

Na Windows padá `wrangler pages dev` (workerd) na "write EOF" chybu – rovnaký problém ako
pri projekte podhajska. Preto beží lokálny Node shim, ktorý spúšťa ten istý Hono router
s D1/R2 nahradenými `node:sqlite` + FS:

```bash
npm install
npm run dev          # http://localhost:8789
npm run dev:reset    # zmaže lokálnu DB/médiá a naplní ukážkový web "demo" nanovo
```

Pri prvom spustení vytvor admin účet cez `POST /api/setup` (token je v `SETUP_TOKEN`,
v deve `devnode-setup`, vypíše sa aj do konzoly pri štarte) – alebo z dashboardu cez
odkaz „Vytvoriť administrátora“ na prihlasovacej obrazovke.

## Nasadenie (Cloudflare)

Rovnaký postup ako pri podhajska:

```bash
npx wrangler d1 create site_builder        # doplň database_id do wrangler.toml
npx wrangler r2 bucket create site-builder-media
npx wrangler pages project create site-builder
npm run db:remote                          # spustí migrácie na vzdialenej D1
npx wrangler pages secret put SESSION_SECRET
npx wrangler pages secret put SETUP_TOKEN
npm run deploy
```

Bloky stránky (typy): `hero_slider`, `text` (1–4 stĺpce), `image`, `gallery`.
