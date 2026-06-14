---
name: working-with-api
description: Jak pracovat s API v EmDash a Astro projektech. Pokrývá bezpečné ukládání a načítání API klíčů z .env, tvorbu serverových endpointů v Astro, zabezpečení API tras a volání externích API (např. WEDOS).
---

# Jak pracovat s API v EmDash a Astro

Tento skill popisuje osvědčené postupy a vzory pro práci s API v rámci EmDash CMS (který běží na Astro). Pokrývá jak tvorbu vlastních API endpointů (Astro / EmDash pluginy), tak bezpečné volání externích služeb.

---

## 1. Bezpečná práce s `.env` (API klíče)

Při práci s jakýmikoliv API klíči (např. `API_KEY` v `.env` pro zabezpečení vlastního API, nebo tajné klíče pro externí služby jako WEDOS) musíte striktně dodržovat tato pravidla:

1. **Nikdy neuvádějte hodnoty z `.env` přímo v kódu (hardcoded).**
2. **Nikdy nepublikujte soubor `.env` do Git repozitáře** (měl by být v `.gitignore`).
3. **Klientský vs. Serverový kód**:
   - V Astro jsou proměnné z `.env` ve výchozím nastavení dostupné pouze na **serveru** (`import.meta.env.API_KEY` nebo `process.env.API_KEY`).
   - Pokud byste proměnnou pojmenovali s předponou `PUBLIC_` (např. `PUBLIC_API_KEY`), Astro ji zpřístupní i v prohlížeči. **To pro tajné API klíče nikdy nedělejte!**

### Příklad načtení proměnných v Astro:
```typescript
// src/pages/api/secure-endpoint.ts
const apiKey = import.meta.env.API_KEY || process.env.API_KEY;
const apiUser = import.meta.env.API_USER || process.env.API_USER;
```

---

## 2. Tvorba interních API endpointů v Astro

Astro umožňuje snadno vytvářet API endpointy (Server Endpoints) tím, že do adresáře `src/pages/` přidáte soubor s příponou `.ts` nebo `.js`. Tyto endpointy vrací objekt `Response` s JSON daty.

### Příklad: GET Endpoint vracející data z EmDash kolekce
Vytvořte soubor `src/pages/api/v1/galleries.ts`:

```typescript
import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // 1. Získání dat z EmDash databáze
    const { entries, cacheHint } = await getEmDashCollection("galleries", {
      orderBy: { published_at: "desc" },
      limit: 10,
    });

    // 2. Návrat JSON odpovědi
    return new Response(JSON.stringify({ success: true, data: entries }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // Využití cache
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

---

## 3. Zabezpečení API endpointů (Autorizace)

Pokud chcete, aby k vašemu API měli přístup pouze autorizovaní klienti (např. pomocí klíče přidaného do `.env`), musíte v endpointu ověřit příchozí hlavičky (headers) nebo parametry požadavku.

### Příklad: Ověření API klíče v hlavičce (`X-API-KEY`)
```typescript
import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  // 1. Získání očekávaných přihlašovacích údajů ze serverového prostředí
  const expectedApiKey = import.meta.env.API_KEY || process.env.API_KEY;
  const expectedApiUser = import.meta.env.API_USER || process.env.API_USER;

  // 2. Načtení hlaviček z příchozího požadavku
  const requestApiKey = request.headers.get("x-api-key");
  const requestApiUser = request.headers.get("x-api-user");

  // 3. Kontrola autorizace
  if (!requestApiKey || requestApiKey !== expectedApiKey || requestApiUser !== expectedApiUser) {
    return new Response(JSON.stringify({ success: false, error: "Neautorizovaný přístup" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Zpracování těla požadavku (POST body)
  const body = await request.json();

  return new Response(JSON.stringify({ success: true, message: "Požadavek úspěšně zpracován", received: body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

---

## 4. Práce s API v EmDash pluginech

EmDash pluginy mohou definovat vlastní API trasy, které se automaticky zaregistrují pod `/_emdash/api/plugins/<plugin-id>/<route-name>`.

Tyto trasy se definují v objektu `routes` při volání `definePlugin` v backendové části pluginu.

### Příklad: Plugin s API endpointem
```typescript
// packages/my-plugin/src/sandbox-entry.ts
import { definePlugin } from "emdash";

export default definePlugin({
  routes: {
    // Definice trasy: POST /_emdash/api/plugins/my-plugin/save-data
    "save-data": {
      public: false, // Vyžaduje přihlášeného admina v EmDash UI
      handler: async (routeCtx, ctx) => {
        const input = routeCtx.input; // Tělo požadavku (parsed JSON)
        
        // Uložení do KV úložiště pluginu
        await ctx.storage.settings.put("custom_data", input);

        return { ok: true, message: "Data uložena." };
      }
    },
    // Veřejná trasa: GET /_emdash/api/plugins/my-plugin/public-status
    "public-status": {
      public: true, // Přístupná zvenčí bez přihlášení
      handler: async (routeCtx, ctx) => {
        return { status: "online", timestamp: new Date().toISOString() };
      }
    }
  }
});
```

---

## 5. Volání externích API (např. WEDOS WAPI)

Pokud vaše aplikace potřebuje komunikovat s externím API, doporučuje se vytvořit **interní API endpoint** (tzv. API proxy) v Astro, který:
1. Přijme požadavek z frontendu (prohlížeče).
2. Bezpečně načte tajný API klíč z `.env` na serveru.
3. Provede bezpečné server-to-server volání na externí API.
4. Vrátí výsledek zpět do prohlížeče.

**Tímto způsobem nikdy neexponujete tajné tokeny a hesla do prohlížeče.**

### Příklad: Volání externího API z Astro serveru
```typescript
// src/pages/api/dns/records.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const wedosUser = import.meta.env.WEDOS_USER;
  const wedosPassword = import.meta.env.WEDOS_PASSWORD; // z .env

  if (!wedosUser || !wedosPassword) {
    return new Response(JSON.stringify({ error: "Chybí konfigurace WEDOS API" }), { status: 500 });
  }

  try {
    // Volání externího API
    const response = await fetch("https://api.wedos.com/wapi/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: {
          user: wedosUser,
          auth: wedosPassword, // hash / heslo
          command: "dns-rows-list",
          data: { domain: "mojedomena.cz" }
        }
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Chyba při komunikaci s WEDOS" }), { status: 500 });
  }
};
```

---

## 6. Volání API z frontendu (Astro / React komponenty)

Z klientských komponent (např. formuláře v Reactu nebo vanilla JS `<script>` v Astro šabloně) voláte vaše vlastní interní API trasy pomocí standardního `fetch`.

### Příklad: Odeslání formuláře na zabezpečené API
```html
<!-- src/components/ContactForm.astro -->
<form id="contact-form">
  <input type="text" name="name" required />
  <button type="submit">Odeslat</button>
</form>

<script>
  const form = document.getElementById("contact-form") as HTMLFormElement;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/v1/submit-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pokud je vyžadováno zabezpečení z frontendu:
          "x-api-key": "...", 
          "x-api-user": "..."
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      alert(result.message || "Odesláno!");
    } catch (err) {
      console.error("Chyba při odesílání:", err);
    }
  });
</script>

---

## 7. Oficiální REST API pro EmDash

Pokud potřebujete pracovat s integrovaným REST API rozhraním samotného systému EmDash CMS (např. volat endpointy pro obsah, média, schémata, revize apod. pod cestou `/_emdash/api/`), použijte samostatný specializovaný skill **`emdash-rest-api`**. 

Tento skill (`working-with-api`) se zaměřuje pouze na obecnou práci s API, zabezpečení `.env` souborů, tvorbu vlastních Astro serverových tras a integraci s externími službami (např. WEDOS WAPI).

```
