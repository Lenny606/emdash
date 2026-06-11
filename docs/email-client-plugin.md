# Plugin: email-client

Balík [`packages/email-client`](../packages/email-client) (`@emdash-cms/plugin-email-client`) přidává SMTP transport pro odesílání e-mailů přes [nodemailer](https://nodemailer.com) a veřejný endpoint pro přihlášení k newsletteru.

Plugin je **Node-only** (používá `net`/`tls`), proto běží v **trusted** (in-process) režimu — registruje se přímo v [`astro.config.mjs`](../astro.config.mjs), neinstaluje se z marketplace.

## Co plugin dělá

- Registruje exkluzivního providera **`email:deliver`** → e-mailová pipeline EmDashe (`ctx.email.send()`, autentizační e-maily atd.) se doručuje přes SMTP.
- Vystavuje **`POST /_emdash/api/plugins/email-client/subscribe`** → uloží adresu do storage kolekce `subscribers` (deduplikace podle e-mailu) a pošle potvrzovací e-mail.

## Architektura balíku

| Soubor | Účel |
| --- | --- |
| `src/index.ts` | Deskriptor pluginu — běží ve Vite v build time, **musí být bez side-effectů** |
| `src/sandbox-entry.ts` | Runtime logika (SMTP transport, subscribe route) — odkazovaná přes `entrypoint` |
| `package.json` | Závislost `nodemailer`; exports `.` a `./sandbox` |

Deskriptor deklaruje:

```ts
{
  id: "email-client",
  version: "0.1.0",
  format: "standard",
  entrypoint: "@emdash-cms/plugin-email-client/sandbox",
  capabilities: ["email:provide", "email:send"],
  storage: { subscribers: { indexes: ["email", "createdAt"] } },
}
```

## Registrace

```js
// astro.config.mjs
import { emailClientPlugin } from "@emdash-cms/plugin-email-client";

emdash({
  // ...
  plugins: [emailClientPlugin()],
});
```

> Balík je součástí workspace (`packages/*` v root `package.json`), takže není potřeba ho zvlášť publikovat.

## Konfigurace SMTP

Nastavení se resolvuje nejdřív z KV `settings:*` (editovatelné v adminu), poté z environment proměnných:

| Nastavení (KV) | Env var | Výchozí |
| --- | --- | --- |
| `settings:smtpHost` | `SMTP_HOST` | — |
| `settings:smtpPort` | `SMTP_PORT` | `587` |
| `settings:smtpSecure` | `SMTP_SECURE` | `true` při portu `465` |
| `settings:smtpUser` | `SMTP_USER` | — |
| `settings:smtpPass` | `SMTP_PASS` | — |
| `settings:emailFrom` | `EMAIL_FROM` | fallback na SMTP usera |

**Bez nastaveného SMTP** provider spadne na JSON transport nodemaileru — e-maily se jen zalogují (s varováním), neodešlou se. Lokální vývoj tak funguje i bez přihlašovacích údajů.

## Aktivace doručování v produkci

`email:deliver` je exkluzivní provider. EmDash používá vestavěný dev transport, dokud admin v **Settings → Email** nevybere tento plugin. Po výběru „email-client" se reálné e-maily routují přes SMTP.

## Newsletter endpoint

```
POST /_emdash/api/plugins/email-client/subscribe
```

Uloží adresu do kolekce `subscribers` (deduplikace podle `email`) a pošle potvrzovací e-mail.
