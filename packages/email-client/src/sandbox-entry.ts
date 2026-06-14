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
 */
async function resolveSettings(ctx: PluginContext): Promise<SmtpSettings> {
	const kv = async (key: string) => (await ctx.kv.get<string>(`settings:${key}`)) ?? undefined;

	const host = (await kv("smtpHost")) ?? process.env.SMTP_HOST;
	const user = (await kv("smtpUser")) ?? process.env.SMTP_USER;
	const pass = (await kv("smtpPass")) ?? process.env.SMTP_PASS;

	const portRaw = (await kv("smtpPort")) ?? process.env.SMTP_PORT;
	const port = portRaw ? Number(portRaw) : 587;

	const secureRaw = (await kv("smtpSecure")) ?? process.env.SMTP_SECURE;
	const secure = secureRaw != null ? secureRaw === "true" || secureRaw === "1" : port === 465;

	const from = (await kv("emailFrom")) ?? process.env.EMAIL_FROM ?? user;

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
	},
});
