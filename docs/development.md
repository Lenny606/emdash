# Vývoj, testování a nasazení

## Předpoklady

- Node.js (LTS)
- npm (projekt používá npm workspaces; `package.json` definuje `packages/*`)

## Lokální vývoj

```bash
npm install
npx emdash dev      # spustí migrace, seed, generování typů + dev server
```

Ekvivalentně `npm run dev` (`astro dev`). EmDash při startu:

1. spustí databázové migrace nad `data.db`,
2. naseeduje obsah ze `seed/seed.json` (pokud je potřeba),
3. vygeneruje typy do `emdash-env.d.ts`.

- **Web:** http://localhost:4321
- **Admin:** http://localhost:4321/_emdash/admin

## Environment proměnné

Soubor [`.env`](../.env):

| Proměnná | Účel |
| --- | --- |
| `EMDASH_ENCRYPTION_KEY` | Šifrovací klíč EmDashe (citlivá data, KV) |

Volitelně SMTP proměnné pro [email-client plugin](./email-client-plugin.md): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.

> `.env`, `data.db*` a `uploads/` patří mimo verzování — viz `.gitignore`.

## Práce se schématem a typy

```bash
npx emdash seed seed/seed.json --validate   # validace seedu
npx emdash types                            # regenerace TS typů
```

Po úpravě `seed.json` znovu spusť dev server nebo `npx emdash types`, aby se aktualizoval `emdash-env.d.ts`.

## Type-check

```bash
npm run typecheck   # astro check
```

## Testování (Playwright)

E2E testy jsou v adresáři [`tests/`](../tests):

| Test | Pokrytí |
| --- | --- |
| `homepage.spec.ts` | Domovská stránka |
| `search.spec.ts`, `search_stability.spec.ts` | Vyhledávání |
| `broken-images.spec.ts` | Kontrola obrázků |
| `404.spec.ts` | Chybová stránka |

```bash
npm test            # spustí testy (chromium, firefox, webkit)
npm run test:ui     # interaktivní UI runner
```

Playwright si sám spustí dev server (`webServer.command = "npm run dev"`, `baseURL = http://localhost:4321`) a mimo CI znovupoužije běžící instanci (`reuseExistingServer`). Report se generuje do `playwright-report/`.

## Produkční build a spuštění

```bash
npm run build       # astro build → dist/
npm run start       # node ./dist/server/entry.mjs
```

Projekt používá adapter `@astrojs/node` v režimu `standalone`, takže `dist/server/entry.mjs` je samostatný Node server.

### Nasazení — co je potřeba na serveru

- Node.js runtime,
- perzistentní `data.db` (SQLite) — nebo migrace na jinou DB přes `emdash/db`,
- perzistentní adresář `uploads/` pro nahraná média,
- nastavené env proměnné (minimálně `EMDASH_ENCRYPTION_KEY`, případně SMTP).

## Agent skills

Pro práci na konkrétních úkolech jsou v `.agents/skills/` připravené skills:

- **building-emdash-site** — dotazování obsahu, Portable Text, návrh schématu, seed soubory, funkce webu (menu, widgety, vyhledávání, SEO, komentáře, bylines).
- **creating-plugins** — tvorba pluginů (hooks, storage, admin UI, API routy, Portable Text bloky).
- **emdash-cli** — CLI příkazy pro správu obsahu, seedování, generování typů a vizuální editaci.
