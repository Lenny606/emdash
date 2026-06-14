---
name: emdash-rest-api
description: Oficiální REST API reference pro EmDash. Pokrývá autentizaci, formáty odpovědí, přehled endpointů (obsah, média, schéma, revize, menu), REST API klient v TS a bezpečné proxy endpointy.
---

# Oficiální REST API pro EmDash

Tento skill slouží jako referenční příručka pro vestavěné REST API v EmDash CMS. Použijte jej, pokud potřebujete volat API rozhraní pod `/_emdash/api/` z externích systémů, skriptů nebo přes zabezpečené proxy endpointy v rámci Astro projektu.

---

## 1. Autentizace a formát odpovědí

Pro přístup k REST API je nutné odesílat HTTP hlavičku `Authorization` s tokenem (API klíčem), který získáte v administraci EmDash:

```http
Authorization: Bearer <API_KEY>
```

### Formát úspěšné odpovědi (JSON):
```json
{
  "success": true,
  "data": {
    // Vrácená data podle endpointu
  }
}
```

### Formát chybové odpovědi (JSON):
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Lidsky čitelný popis chyby",
    "details": {} // Volitelné detaily o chybě
  }
}
```

---

## 2. Přehled klíčových endpointů

| Metoda | Endpoint | Popis |
| :--- | :--- | :--- |
| **Obsah** | | |
| `GET` | `/_emdash/api/content/:collection` | Získání seznamu položek (podpora `limit`, `cursor`, `status`, `orderBy`, `order`) |
| `GET` | `/_emdash/api/content/:collection/:id` | Získání detailu jedné položky podle ID nebo slugu |
| `POST` | `/_emdash/api/content/:collection` | Vytvoření nové položky (body: `{ data: {...}, slug: "...", status: "draft"|"published" }`) |
| `PUT` | `/_emdash/api/content/:collection/:id` | Aktualizace existující položky (body: `{ data: {...}, status: "..." }`) |
| `DELETE`| `/_emdash/api/content/:collection/:id` | Odstranění položky |
| **Média** | | |
| `GET` | `/_emdash/api/media` | Získání seznamu médií |
| `POST` | `/_emdash/api/media` | Nahrání souboru (Multipart form data) |
| `DELETE`| `/_emdash/api/media/:id` | Odstranění média z databáze i úložiště |
| `GET` | `/_emdash/api/media/file/:key` | Získání samotného souboru (např. obrázku) |
| **Schéma**| | |
| `GET` | `/_emdash/api/schema` | Výpis všech kolekcí |
| `GET` | `/_emdash/api/schema/export/json` | Export schématu do formátu JSON |
| `GET` | `/_emdash/api/schema/export/ts` | Export TypeScript typů pro kolekce |
| **Revize**| | |
| `GET` | `/_emdash/api/revisions/:collection/:id` | Seznam revizí pro danou položku |
| `POST` | `/_emdash/api/revisions/:collection/:id/:revId/restore` | Obnovení položky ze specifické revize |
| **Menu a taxonomie** | | |
| `GET` | `/_emdash/api/menus` | Seznam navigačních menu |
| `GET` | `/_emdash/api/taxonomies` | Seznam definovaných taxonomií |

---

## 3. Příklad: Vytvoření helper klienta pro REST API (TypeScript)

Doporučeným přístupem je vytvoření jednoduché klientské třídy pro volání EmDash REST API:

```typescript
// src/utils/emdash-client.ts
export class EmDashClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = "/_emdash/api";
    // Načtení klíče z prostředí na serveru
    this.apiKey = import.meta.env.API_KEY || process.env.API_KEY || "";
    if (!this.apiKey) {
      console.warn("EmDashClient: API_KEY nebyl nalezen v proměnných prostředí.");
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error?.message || `API Request failed with status ${response.status}`);
    }

    return result.data;
  }

  // Získání položek
  async getItems<T = any>(collection: string, queryParams?: Record<string, string>): Promise<{ items: T[]; nextCursor?: string }> {
    const query = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
    return this.request(`/content/${collection}${query}`);
  }

  // Vytvoření položky
  async createItem<T = any>(collection: string, data: { data: Record<string, any>; slug?: string; status?: "draft" | "published" }): Promise<T> {
    return this.request(`/content/${collection}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Aktualizace položky
  async updateItem<T = any>(collection: string, id: string, data: { data: Record<string, any>; status?: "draft" | "published" }): Promise<T> {
    return this.request(`/content/${collection}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
}
```

---

## 4. Bezpečné použití v Astro API Endpoint (Proxy)

Pokud potřebujete, aby klientská část webu mohla nepřímo volat EmDash REST API (např. pro registraci nového odběratele newsletteru), vytvořte bezpečný serverový proxy endpoint v Astro:

```typescript
// src/pages/api/newsletter.ts
import type { APIRoute } from "astro";
import { EmDashClient } from "../../utils/emdash-client";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, name } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email je povinný" }), { status: 400 });
    }

    const client = new EmDashClient();
    
    // Uložíme odběratele do EmDash kolekce "subscribers" přes REST API
    const response = await client.createItem("subscribers", {
      data: { email, name },
      slug: email.replace(/[^a-zA-Z0-9]/g, "-"),
      status: "published",
    });

    return new Response(JSON.stringify({ success: true, subscriber: response }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```
