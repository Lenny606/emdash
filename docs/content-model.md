a# Datový model

Schéma i počáteční (demo) obsah jsou definovány v jednom souboru: [`seed/seed.json`](../seed/seed.json). Při startu dev serveru EmDash spustí migrace, naseeduje obsah a vygeneruje TypeScript typy do [`emdash-env.d.ts`](../emdash-env.d.ts).

## Globální nastavení

```json
"settings": {
  "title": "AI Dev Pulse",
  "tagline": "Budoucnost programování v éře umělé inteligence"
}
```

Tyto hodnoty se v kódu načítají přes `getSiteSettings()` a normalizují pomocným helperem `resolveStarterSiteIdentity()` ([`src/utils/site-identity.ts`](../src/utils/site-identity.ts)), který doplní výchozí hodnoty a vyřeší logo. Nastavení (včetně loga a faviconu) lze editovat v adminu.

## Kolekce

### `posts` — Články

| Pole | Slug | Typ | Pozn. |
| --- | --- | --- | --- |
| Titulek | `title` | `string` | povinné, searchable |
| Náhledový obrázek | `featured_image` | `image` | objekt `{ src, alt }` |
| Obsah | `content` | `portableText` | searchable |
| Perex | `excerpt` | `text` | |

Podpora: `drafts`, `revisions`, `search`, `seo`.

### `pages` — Stránky

| Pole | Slug | Typ | Pozn. |
| --- | --- | --- | --- |
| Titulek | `title` | `string` | povinné, searchable |
| Obsah | `content` | `portableText` | searchable |

Podpora: `drafts`, `revisions`, `search`, `seo`. Stránky se zobrazují přes route `/:slug` (např. `/about`).

## Taxonomie

> ⚠️ Název taxonomie v dotazech (`getEntryTerms`) musí přesně odpovídat poli `"name"`, tedy `category` a `tag` (jednotné číslo).

### `category` — Kategorie (hierarchická)

Přiřazená ke kolekci `posts`. Termy:
`ai-programming`, `machine-learning`, `future-of-coding`, `ai-tools`, `general`.

### `tag` — Tagy (ploché)

Přiřazené ke kolekci `posts`. Termy:
`copilot`, `productivity`, `neural-networks`, `llm`, `ethics`, `automation`, `coding`.

## Menu

Menu `primary` (`Hlavní navigace`) se načítá v `Base.astro` přes `getMenu("primary")`:

| Štítek | URL |
| --- | --- |
| Domů | `/` |
| Články | `/posts` |
| Kategorie | `/category` |
| Tagy | `/tag` |
| O nás | `/about` |

## Widgety

Widget area `sidebar` se renderuje v patičce přes `<WidgetArea name="sidebar" />`:

| Widget | Component ID | Nastavení |
| --- | --- | --- |
| Hledat | `core:search` | — |
| Kategorie | `core:categories` | — |
| Nejnovější články | `core:recent-posts` | `count: 5` |

## Demo obsah

Seed obsahuje ukázkovou stránku `about` a články (např. *„Jak GitHub Copilot mění každodenní rutinu vývojáře"*) s přiřazenými kategoriemi a štítky přes pole `taxonomies`.

## Práce se schématem

```bash
npx emdash seed seed/seed.json --validate   # Validace seedu
npx emdash types                            # Regenerace typů po změně schématu
```

Po úpravě `seed.json` (nová pole/kolekce) spusť `npx emdash dev` nebo `npx emdash types`, aby se aktualizoval `emdash-env.d.ts`.