import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import nodemailer, { type Transporter } from "nodemailer";

/** Subset of EmailMessage we care about (matches emdash's EmailMessage). */
interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

interface SmtpSettings {
	host?: string;
	port: number;
	secure: boolean;
	user?: string;
	pass?: string;
	from?: string;
}

/**
 * Resolve SMTP settings. KV `settings:*` (admin-configurable) wins over
 * environment variables, so the host app can override without code changes.
 *
 * The admin settings form stores `smtpPort` as a number and `smtpSecure` as a
 * boolean, while env vars are strings — so both fields accept either shape.
 */
async function resolveSettings(ctx: PluginContext): Promise<SmtpSettings> {
	const kv = <T = string>(key: string) => ctx.kv.get<T>(`settings:${key}`);

	const host = ((await kv("smtpHost")) ?? process.env.SMTP_HOST) || undefined;
	const user = ((await kv("smtpUser")) ?? process.env.SMTP_USER) || undefined;
	const pass = ((await kv("smtpPass")) ?? process.env.SMTP_PASS) || undefined;

	const portRaw = (await kv<number | string>("smtpPort")) ?? process.env.SMTP_PORT;
	const port = portRaw != null && portRaw !== "" ? Number(portRaw) : 587;

	const secureRaw = (await kv<boolean | string>("smtpSecure")) ?? process.env.SMTP_SECURE;
	const secure =
		secureRaw != null && secureRaw !== ""
			? secureRaw === true || secureRaw === "true" || secureRaw === "1"
			: port === 465;

	const from = ((await kv("emailFrom")) ?? process.env.EMAIL_FROM) || user;

	return { host, port, secure, user, pass, from };
}

/**
 * Build a nodemailer transport. When SMTP is not configured (no host/user),
 * fall back to a JSON transport so the site works out-of-the-box in dev —
 * emails are logged instead of sent rather than throwing.
 */
function createTransport(settings: SmtpSettings): Transporter {
	if (!settings.host || !settings.user) {
		return nodemailer.createTransport({ jsonTransport: true });
	}
	return nodemailer.createTransport({
		host: settings.host,
		port: settings.port,
		secure: settings.secure,
		auth: { user: settings.user, pass: settings.pass },
	});
}

function newId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Admin settings page path — must match `adminPages` in the descriptor. */
const SETTINGS_PAGE = "/settings";

/** Block Kit settings form, prefilled from the currently stored KV values. */
function settingsBlocks(current: SmtpSettings & { hasPass: boolean }) {
	return [
		{ type: "header", text: "SMTP konfigurace" },
		{
			type: "context",
			text: "Hodnoty se ukládají šifrovaně do nastavení pluginu a mají přednost před proměnnými prostředí (SMTP_HOST, …).",
		},
		{
			type: "form",
			block_id: "smtp",
			fields: [
				{
					type: "text_input",
					action_id: "smtpHost",
					label: "SMTP Host",
					placeholder: "smtp.seznam.cz",
					initial_value: current.host ?? "",
				},
				{
					type: "number_input",
					action_id: "smtpPort",
					label: "SMTP Port",
					min: 1,
					max: 65535,
					initial_value: current.port,
				},
				{
					type: "toggle",
					action_id: "smtpSecure",
					label: "Použít TLS/SSL (port 465)",
					initial_value: current.secure,
				},
				{
					type: "text_input",
					action_id: "smtpUser",
					label: "SMTP uživatel",
					initial_value: current.user ?? "",
				},
				{
					type: "secret_input",
					action_id: "smtpPass",
					label: current.hasPass ? "SMTP heslo (uloženo — vyplňte pro změnu)" : "SMTP heslo",
				},
				{
					type: "text_input",
					action_id: "emailFrom",
					label: "Odesílatel (From)",
					placeholder: "noreply@artispraga.cz",
					initial_value: current.from ?? "",
				},
			],
			submit: { label: "Uložit", action_id: "save" },
		},
	];
}

export default definePlugin({
	hooks: {
		// Exclusive transport provider for EmDash's email pipeline.
		"email:deliver": {
			exclusive: true,
			handler: async (event: { message: EmailMessage; source: string }, ctx: PluginContext) => {
				const { message } = event;
				const settings = await resolveSettings(ctx);
				const transport = createTransport(settings);

				const info = await transport.sendMail({
					from: settings.from,
					to: message.to,
					subject: message.subject,
					text: message.text,
					html: message.html,
				});

				if (!settings.host || !settings.user) {
					ctx.log.warn(
						`SMTP not configured — email to ${message.to} was logged, not sent. ` +
							"Set SMTP_HOST/SMTP_USER/SMTP_PASS (or settings:smtp*) to enable delivery.",
						{ subject: message.subject, source: event.source },
					);
				} else {
					ctx.log.info(`Email delivered to ${message.to}`, {
						messageId: info.messageId,
						source: event.source,
					});
				}
			},
		},
	},

	routes: {
		// Public newsletter signup: POST { email } -> stores subscriber + sends confirmation.
		subscribe: {
			public: true,
			handler: async (routeCtx: { input?: unknown }, ctx: PluginContext) => {
				const input = (routeCtx.input ?? {}) as { email?: string };
				const email = (input.email ?? "").trim().toLowerCase();

				if (!EMAIL_RE.test(email)) {
					return { ok: false, error: "Neplatná e-mailová adresa." };
				}

				const existing = await ctx.storage.subscribers!.query({ where: { email }, limit: 1 });
				if (existing.items.length > 0) {
					return { ok: true, alreadySubscribed: true };
				}

				await ctx.storage.subscribers!.put(newId(), {
					email,
					createdAt: new Date().toISOString(),
				});

				// Best-effort confirmation email — never fail the signup over it.
				try {
					await ctx.email?.send({
						to: email,
						subject: "Potvrzení odběru newsletteru",
						text:
							"Děkujeme za přihlášení k odběru newsletteru Artis Praga.\n\n" +
							"Pokud jste se nepřihlásili vy, tento e-mail ignorujte.",
					});
				} catch (err) {
					ctx.log.warn("Confirmation email failed", { err: String(err) });
				}

				return { ok: true, subscribed: true };
			},
		},

		// Block Kit admin page (Settings -> email-client) for editing SMTP config.
		// Reads/writes the same `settings:*` KV keys consumed by resolveSettings().
		admin: {
			handler: async (
				routeCtx: { input?: unknown },
				ctx: PluginContext,
			): Promise<{ blocks: unknown[]; toast?: { message: string; type: string } }> => {
				const interaction = (routeCtx.input ?? {}) as {
					type?: string;
					page?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};

				const current = async () => {
					const s = await resolveSettings(ctx);
					return { ...s, hasPass: Boolean(s.pass) };
				};

				if (interaction.type === "page_load" && interaction.page === SETTINGS_PAGE) {
					return { blocks: settingsBlocks(await current()) };
				}

				if (interaction.type === "form_submit" && interaction.action_id === "save") {
					const v = interaction.values ?? {};
					const setStr = async (key: string) => {
						const raw = v[key];
						await ctx.kv.set(`settings:${key}`, raw == null ? "" : String(raw).trim());
					};

					await setStr("smtpHost");
					await setStr("smtpUser");
					await setStr("emailFrom");
					await ctx.kv.set("settings:smtpPort", Number(v.smtpPort) || 587);
					await ctx.kv.set("settings:smtpSecure", v.smtpSecure === true || v.smtpSecure === "true");

					// Only overwrite the password when a new one is entered, so re-saving
					// the form with the masked field left blank keeps the stored secret.
					const pass = typeof v.smtpPass === "string" ? v.smtpPass.trim() : "";
					if (pass) await ctx.kv.set("settings:smtpPass", pass);

					return {
						blocks: settingsBlocks(await current()),
						toast: { message: "Nastavení SMTP uloženo.", type: "success" },
					};
				}

				return { blocks: settingsBlocks(await current()) };
			},
		},
	},
});
