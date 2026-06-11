# Stránky a routy

Všechny stránky jsou **server-rendered** (žádné `getStaticPaths()` pro CMS obsah). Layout zajišťuje [`src/layouts/Base.astro`](../src/layouts/Base.astro).

## Přehled rout

| Route | Soubor | Popis |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | Domovská stránka — výpis nejnovějších článků |
| `/posts` | `src/pages/posts/index.astro` | Výpis všech článků |
| `/posts/:slug` | `src/pages/posts/[slug].astro` | Detail článku |
| `/category` | `src/pages/category/index.astro` | Přehled kategorií |
| `/category/:slug` | `src/pages/category/[slug].astro` | Archiv článků v kategorii |
| `/tag` | `src/pages/tag/index.astro` | Přehled štítků |
| `/tag/:slug` | `src/pages/tag/[slug].astro` | Archiv článků se štítkem |
| `/search?q=...` | `src/pages/search.astro` | Výsledky fulltextového hledání (`noindex`) |
| `/:slug` | `src/pages/[slug].astro` | Statické stránky z kolekce `pages` (např. `/about`) |
| `/rss.xml` | `src/pages/rss.xml.ts` | RSS feed (20 nejnovějších článků) |
| `/404` | `src/pages/404.astro` | Chybová stránka |

## Layout — `Base.astro`

Společný rámec pro všechny stránky:

- **Hlavička** — logo / název webu (z `getSiteSettings()`), navigace z menu `primary`, živé vyhledávání (`LiveSearch` nad kolekcemi `posts`, `pages`), mobilní toggle menu.
- **SEO hlavička** — `<EmDashHead>` emituje title, description a kanonickou URL z page contextu vytvořeného přes `createPublicPageContext()`. Každá stránka má self-referencing canonical; obsahové stránky ho mohou přepsat přes props.
- **Patička** — branding, tagline a widget area `sidebar` (`<WidgetArea name="sidebar" />`).
- **Page contributions** — pluginy mohou přispívat do `<head>`/body přes `EmDashHead`, `EmDashBodyStart`, `EmDashBodyEnd`.

### Props layoutu

| Prop | Typ | Popis |
| --- | --- | --- |
| `title` | `string` | Titulek stránky (povinný) |
| `pageTitle` | `string?` | OG titulek |
| `description` | `string?` | Popis (fallback na site tagline) |
| `image` | `string?` | OG obrázek |
| `canonical` | `string?` | Kanonická URL (override) |
| `noindex` | `boolean?` | Emituje `robots: noindex, nofollow` (např. vyhledávání) |
| `content` | `{ collection, id, slug }?` | Reference na obsah pro plugin page contributions |

## Vzory dotazování obsahu

### Výpis kolekce

```astro
const { entries: posts, cacheHint } = await getEmDashCollection("posts", {
  orderBy: { published_at: "desc" },
});
Astro.cache.set(cacheHint);   // VŽDY nastavit cache hint
```

### Detail záznamu + taxonomie + SEO

```astro
const slug = decodeSlug(Astro.params.slug);
const { entry: post, cacheHint } = await getEmDashEntry("posts", slug);
if (!post) return Astro.redirect("/404");
Astro.cache.set(cacheHint);

const seo = getSeoMeta(post, { siteTitle, siteUrl: Astro.url.origin, path: `/posts/${slug}` });

// POZOR: post.data.id (ULID), ne post.id (slug)
const tags = await getEntryTerms("posts", post.data.id, "tag");
const categories = await getEntryTerms("posts", post.data.id, "category");
```

### Archiv podle taxonomie

```astro
const term = await getTerm("category", slug);
const { entries: posts, cacheHint } = await getEmDashCollection("posts", {
  where: { category: term.slug },          // klíč = název taxonomie ze seedu
  orderBy: { published_at: "desc" },
});
```

### Fulltextové vyhledávání

```astro
const searchResponse = await search(query, {
  collections: ["posts", "pages"],
  status: "published",
  limit: 20,
});
const results = searchResponse?.items ?? [];
```

Výsledky obsahují `snippet` s `<mark>` zvýrazněním (stylováno v `search.astro`).

## Renderování obsahu

- **Portable Text** — pole typu `portableText` se renderuje přes `<PortableText value={post.data.content} />` z `emdash/ui`.
- **Obrázky** — pole typu `image` jsou objekty `{ src, alt }`; renderují se přes `<Image image={post.data.featured_image} />` (wrapper [`src/components/Image.astro`](../src/components/Image.astro)).
- **Vizuální editace** — spread `{...post.edit.<field>}` na elementu napojí pole na in-place editaci v admin režimu (např. `{...post.edit.title}`).

## Komponenty

| Komponenta | Účel |
| --- | --- |
| `Base.astro` | Layout (viz výše) |
| `PostList.astro` | Výpis článků; sloty `empty`, prop `emptyText`, `showReadMore` |
| `PostCard.astro` | Karta jednotlivého článku |
| `Sidebar.astro` | Boční panel (widget area) |
| `Image.astro` | Wrapper nad `<Image>` z `emdash/ui` pro pole `{ src, alt }` |

## Pomocné utility

- [`src/utils/site-identity.ts`](../src/utils/site-identity.ts) — `resolveStarterSiteIdentity()` normalizuje název, tagline a logo z nastavení webu.
- [`src/utils/format.ts`](../src/utils/format.ts) — `formatDate()` a `plural()` (české skloňování číslovek: záznam / záznamy / záznamů).
