# Plán: obsahový model Prestige v EmDash

> Návrh, jak obsah z `content/prestige-home.md` a stránky `src/pages/prestige.astro`
> převést do editovatelných EmDash struktur (kolekce, taxonomie, singletony, menu).
> Zatím jen struktura — bez implementace.

## 1. Kolekce (collections)

### `services` — Ošetření (jádro, „produkty")

Hlavní opakovatelný obsah. Každé ošetření = jeden záznam.

| Pole | Typ | Poznámka |
|------|-----|----------|
| `title` | text | „Idenel s mikrojehličkami" |
| `slug` | auto | URL |
| `excerpt` | text | krátký popis do karty (grid/strip) |
| `body` | portable text | detail: postup, benefity, pro koho |
| `featured_image` | image | thumbnail i hero detailu |
| `gallery` | list(image) | volitelné fotky |
| `price_from` | number | cena od |
| `price_note` | text/select | „za ošetření" / „za balíček" |
| `duration_min` | number | délka procedury |
| `category` | taxonomy → `service_category` | viz níže |
| `brand_line` | taxonomy → `brand_line` | Esthederm, Di Angelo… |
| `featured` | boolean | zařadí do hero stripu na HP |
| `order` | number | ruční řazení |
| `related` | reference(list → services) | „mohlo by se hodit" |
| `seo` | group (title, description) | |

### `promotions` — Akce / nabídky (PEPTAXEL apod.)

| Pole | Typ |
|------|-----|
| `title`, `eyebrow` | text |
| `description` | portable text |
| `price_regular`, `price_package`, `saving` | number |
| `valid_from`, `valid_to` | date (řídí „aktivní") |
| `service` | reference → `services` |
| `image` | image |
| `cta_label`, `cta_url` | text |

### `team` — Tým / spolupráce (Jindřich Michálek)

| Pole | Typ | Poznámka |
|------|-----|----------|
| `name`, `role` | text | |
| `bio` | portable text | |
| `photo` | image | |
| `photo_focus` | text/select | **object-position** — řeší ořez fotky z adminu, ne v CSS |
| `socials` | list(label, url) | |
| `featured`, `order` | boolean / number | |

### `articles` — Články / blog *(volitelné, doporučené pro SEO)*

title, slug, excerpt, body, cover_image, **author → byline**, `tag` (taxonomy), `published_at`, seo.

### `pages` — Obecné stránky

Obchodní podmínky, Zásady cookies, O nás. title, slug, body, seo.
*(kolekce už ve webu existuje — znovupoužít)*

---

## 2. Taxonomie

| Taxonomie | Termy |
|-----------|-------|
| `service_category` | Ošetření pleti · Tvarování těla · Biohack · Brow & Lash · Mikrojehličkování |
| `brand_line` *(volitelné)* | Institut Esthederm · Di Angelo · Idenel · Autobiography Photon Pro · Renasculpt |
| `article_tag` *(pokud blog)* | dle potřeby |

> `service_category` napájí **řádek kategorií** na HP i případné filtrování v přehledu ošetření.

---

## 3. Singletony / sekce (editovatelné bloky webu)

Pro obsah, který není „seznam", ale jeden konfigurovatelný blok:

- **`site_identity`** — název, `logo`, `logo_black`, tagline, slogan
- **`contact`** — adresa, telefon, e-mail, `hours` (list řádků den/čas), `socials`, mapa
- **`homepage`** — `hero_image`, `hero_slogan`, `hero_cta`, `values` (list textů), `featured_promotion` (ref), volba featured služeb

---

## 4. Menu

| Menu | Obsah |
|------|-------|
| `primary` | hlavních 12 položek navigace |
| `footer_legal` | Obchodní podmínky, Zásady cookies |

---

## 5. Média

Nahrát z CDN do EmDash media library (nezávislost na cizím CDN):
logo, logo-black, hero panorama, 9 thumbnailů ošetření, PEPTAXEL, foto Michálek.

---

## 6. Mapování sekcí stránky → model

| Sekce na `/prestige` | Zdroj dat |
|----------------------|-----------|
| Hero (logo, slogan, CTA) | `site_identity` + `homepage` |
| Strip (4 featured) | `services` kde `featured = true` |
| Řádek kategorií | termy `service_category` |
| Hodnoty | `homepage.values` |
| „Naše ošetření" grid | `services` (řazené dle `order`) |
| PEPTAXEL feature | `promotions` (featured / aktivní) |
| Spolupráce | `team` kde `featured = true` |
| Patička | `contact` + `footer_legal` + `site_identity` |

---

## 7. Postup v budoucnu (až budeme kódit)

1. Rozšířit `seed/seed.json` o kolekce, taxonomie, singletony, menu
2. `npx emdash seed --validate` → `npx emdash dev` (migrace + typy)
3. Nahrát média, naplnit obsah v adminu
4. Přepsat `prestige.astro` — hardcoded pole nahradit `getEmDashCollection` /
   `getSection` / `getMenu` + `Astro.cache.set(cacheHint)`
5. Ořezy fotek řešit polem `photo_focus`, ne v CSS

---

## 8. Rozhodnutí k potvrzení (ovlivní model)

- **Blog/články** ano/ne? (přidává `articles` + `article_tag` + bylines)
- **Ceník**: strukturovaně (`number` → filtrování, řazení, „od") nebo volný text?
- **Rezervace**: externí systém (Reservio…) jen odkazem, nebo evidovat termíny v CMS?
