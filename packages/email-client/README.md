# @emdash-cms/plugin-email-client

SMTP email transport for EmDash (via [nodemailer](https://nodemailer.com)) plus a
public newsletter `subscribe` endpoint.

Node-only (uses `net`/`tls`), so it runs as a **trusted** in-process plugin —
it is registered in `astro.config.mjs`, not installed from the marketplace.

## What it does

- Registers the exclusive **`email:deliver`** provider, so EmDash's email
  pipeline (`ctx.email.send()`, auth emails, etc.) is delivered over SMTP.
- Exposes **`POST /_emdash/api/plugins/email-client/subscribe`** — stores the
  address in the `subscribers` storage collection (deduplicated by email) and
  sends a confirmation email.

## Registration

```js
// astro.config.mjs
import { emailClientPlugin } from "@emdash-cms/plugin-email-client";

emdash({
  // ...
  plugins: [emailClientPlugin()],
});
```

## Configuration

SMTP settings resolve from KV `settings:*` first (admin-editable), then from
environment variables:

| Setting (KV)         | Env var       | Default                    |
| -------------------- | ------------- | -------------------------- |
| `settings:smtpHost`  | `SMTP_HOST`   | —                          |
| `settings:smtpPort`  | `SMTP_PORT`   | `587`                      |
| `settings:smtpSecure`| `SMTP_SECURE` | `true` when port is `465`  |
| `settings:smtpUser`  | `SMTP_USER`   | —                          |
| `settings:smtpPass`  | `SMTP_PASS`   | —                          |
| `settings:emailFrom` | `EMAIL_FROM`  | falls back to the SMTP user |

**No SMTP configured?** The provider falls back to nodemailer's JSON transport —
emails are logged (with a warning), not sent — so local dev works without
credentials.

## Activating delivery in production

`email:deliver` is an exclusive provider. EmDash uses its built-in dev transport
until an admin selects this plugin under **Settings → Email**. Select
"email-client" there to route real mail through SMTP.
