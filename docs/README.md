# Dokumentace projektu — AI Dev Pulse

**AI Dev Pulse** je technologický magazín postavený na CMS [EmDash](https://github.com/emdash-cms/emdash) nad frameworkem [Astro](https://astro.build). Web je plně server-rendered, obsah se spravuje přes vestavěné admin rozhraní a běží na Node.js se SQLite databází a lokálním úložištěm souborů.

> Tagline: *„Budoucnost programování v éře umělé inteligence"*

## Obsah dokumentace

| Dokument | Popis |
| --- | --- |
| [README.md](./README.md) | Tento přehled — architektura, struktura, spuštění |
| [content-model.md](./content-model.md) | Datový model — kolekce, taxonomie, menu, widgety |
| [pages-and-routing.md](./pages-and-routing.md) | Stránky, routy a jejich logika |
| [email-client-plugin.md](./email-client-plugin.md) | Plugin pro SMTP odesílání e-mailů a newsletter |
| [development.md](./development.md) | Vývoj, testování, build a nasazení |

---

## Přehled architektury

```
┌──────────────────────────────────────────────────────────┐
│  Prohlížeč                                                 │
└───────────────┬──────────────────────────────────────────┘
                │ HTTP (server-rendered HTML)
┌───────────────▼──────────────────────────────────────────┐
│  Astro (output: "server", adapter @astrojs/node)          │
│                                                            │
│  ┌──────────────┐   ┌────────────────────────────────┐    │
│  │ src/pages/   │   │  emdash() integrace            │    │
│  │ (.astro)     │◄──┤  • obsah, taxonomie, menu      │    │
│  │              │   │  • admin UI (/_emdash/admin)   │    │
│  │ src/layouts/ │   │  • vyhledávání, SEO, widgety   │    │
│  │ src/components│   │  • pluginy (email-client)      │    │
│  └──────────────┘   └──────┬──────────────┬──────────┘    │
└────────────────────────────┼──────────────┼───────────────┘
                             │              │
                    ┌────────▼───┐   ┌──────▼────────┐
                    │ SQLite     │   │ ./uploads/    │
                    │ data.db    │   │ (lokální média)│
                    └────────────┘   └───────────────┘
```

### Klíčové technologie

| Vrstva | Technologie |
| --- | --- |
| Framework | Astro `^6.0.1` (`output: "server"`) |
| Runtime / adapter | Node.js + `@astrojs/node` (standalone) |
| CMS | EmDash `^0.9.0` |
| Databáze | SQLite přes `better-sqlite3` (`file:./data.db`) |
| Úložiště médií | Lokální filesystem (`./uploads`) |
| UI knihovna | React `19.x` (přes `@astrojs/react`) |
| Testy | Playwright `^1.59` |
| E-maily | Vlastní plugin `@emdash-cms/plugin-email-client` (nodemailer) |

---

## Struktura repozitáře

```
emdash/
├── astro.config.mjs          # Astro + emdash() integrace, DB, storage, pluginy
├── seed/seed.json            # Definice schématu + demo obsah
├── emdash-env.d.ts           # Generované typy kolekcí (auto)
├── src/
│   ├── live.config.ts        # Registrace EmDash loaderu (boilerplate)
│   ├── layouts/Base.astro    # Základní layout (hlavička, menu, vyhledávání, patička)
│   ├── pages/                # Astro stránky (vše server-rendered)
│   │   ├── index.astro       # Domovská stránka — seznam článků
│   │   ├── [slug].astro      # Statické stránky (kolekce "pages")
│   │   ├── posts/            # Výpis a detail článků
│   │   ├── category/         # Archiv podle kategorií
│   │   ├── tag/              # Archiv podle štítků
│   │   ├── search.astro      # Stránka výsledků vyhledávání
│   │   ├── rss.xml.ts        # RSS feed
│   │   └── 404.astro         # Chybová stránka
│   ├── components/           # Image, Sidebar, PostCard, PostList
│   ├── utils/                # site-identity, format
│   └── styles/global.css     # Globální styly (neo-brutalist vzhled)
├── packages/
│   └── email-client/         # Trusted in-process plugin (SMTP + newsletter)
├── tests/                    # Playwright e2e testy
├── uploads/                  # Nahrané soubory (média)
└── data.db                   # SQLite databáze
```

---

## Rychlý start

```bash
# Instalace závislostí
npm install

# Spuštění dev serveru (migrace, seed, generování typů)
npx emdash dev
# nebo
npm run dev
```

- **Web:** http://localhost:4321
- **Admin (CMS):** http://localhost:4321/_emdash/admin

### Užitečné příkazy

```bash
npx emdash types                            # Regenerace TS typů ze schématu
npx emdash seed seed/seed.json --validate   # Validace seed souboru
npm run build                               # Produkční build
npm run start                               # Spuštění buildnuté verze (Node)
npm run typecheck                           # astro check
npm test                                    # Playwright e2e testy
```

---

## Důležitá pravidla projektu

Tato pravidla platí napříč kódem (viz též `AGENTS.md` / `CLAUDE.md`):

1. **Vše je server-rendered** (`output: "server"`). Pro CMS obsah se nepoužívá `getStaticPaths()`.
2. **Obrázková pole jsou objekty** `{ src, alt }`, ne řetězce. Pro renderování použij `<Image image={...} />` z `emdash/ui` (zde wrapper `src/components/Image.astro`).
3. **`entry.id` je slug** (pro URL), **`entry.data.id` je databázové ULID** (pro API volání jako `getEntryTerms`).
4. **Vždy volej `Astro.cache.set(cacheHint)`** na stránkách, které dotazují obsah.
5. **Názvy taxonomií v dotazech musí přesně odpovídat poli `"name"` v seedu** (např. `"category"`, ne `"categories"`).

---

## Související odkazy

- [EmDash dokumentace](https://github.com/emdash-cms/emdash/tree/main/docs)
- Agent skills v `.agents/skills/` (`building-emdash-site`, `creating-plugins`, `emdash-cli`)