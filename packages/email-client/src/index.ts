import type { PluginDescriptor } from "emdash";

/**
 * Email client plugin (descriptor).
 *
 * Runs in Vite at build time — must stay side-effect-free. The runtime logic
 * lives in `./sandbox-entry.ts` (referenced via `entrypoint`).
 *
 * Provides an SMTP email transport (via nodemailer) for EmDash's email
 * pipeline, plus a public newsletter `subscribe` endpoint backed by a
 * `subscribers` storage collection.
 *
 * Node-only (nodemailer uses `net`/`tls`), so it runs in trusted mode and
 * reads SMTP configuration from environment variables — see sandbox-entry.ts.
 */
export function emailClientPlugin(): PluginDescriptor {
	return {
		id: "email-client",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@emdash-cms/plugin-email-client/sandbox",
		// email:provide -> register the exclusive email:deliver transport.
		// email:send    -> call ctx.email.send() from the subscribe route.
		capabilities: ["email:provide", "email:send"],
		storage: {
			subscribers: { indexes: ["email", "createdAt"] },
		},
		// Block Kit settings page for editing SMTP config in the admin.
		// The "/settings" path is handled by the `admin` route in sandbox-entry.ts.
		adminPages: [{ path: "/settings", label: "Email (SMTP)", icon: "mail" }],
	};
}

export default emailClientPlugin;
