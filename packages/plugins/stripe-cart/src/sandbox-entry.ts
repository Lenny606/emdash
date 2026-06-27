import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { z } from "astro/zod";
import Stripe from "stripe";
import {
	renderAdminOrderEmail,
	renderCustomerOrderEmail,
	type OrderEmailData,
} from "./order-email";
import { renderInvoiceHtml, type InvoiceConfig } from "./invoice";

/**
 * Stripe cart plugin — runtime definition.
 *
 * Routes are exposed at /_emdash/api/plugins/stripe-cart/<route>:
 *   GET  /config    -> publishable key + currency for the storefront
 *   POST /checkout  -> { items: [{ productId, quantity }] } -> { url, sessionId }
 *   POST /webhook   -> Stripe webhook receiver (confirms payment)
 *
 * Pricing is ALWAYS resolved server-side from the EmDash `products` collection.
 * The client only ever sends product ids + quantities — never prices.
 *
 * NOTE: the EmDash plugin-route runner converts any *thrown* value into a
 * generic `{ error: { code: "INTERNAL_ERROR", message: "Plugin route error" } }`
 * (status 500) and discards the original message. So user-facing failures are
 * *returned* as `{ error: "..." }` instead of thrown — that keeps the real
 * message reaching the client. Only the webhook throws (it wants a non-2xx so
 * Stripe retries).
 */

interface CartConfig {
	secretKey?: string;
	publishableKey?: string;
	webhookSecret?: string;
	currency: string;
	productsCollection: string;
	/** Absolute site origin used to build Stripe success/cancel URLs. */
	siteOrigin?: string;
	successPath: string;
	cancelPath: string;
	/** Recipient for new-order notifications (the shop operator). */
	adminEmail?: string;
}

/**
 * Read an env var the EmDash way: plugin route handlers run inside the
 * Astro/Vite bundle, where `.env` is exposed on `import.meta.env` — NOT on
 * `process.env`. We consult `import.meta.env` first (dev `.env`, build-time
 * substitutions) then fall back to `process.env` (real runtime env vars on a
 * Node/VPS deployment).
 */
function readEnv(key: string): string | undefined {
	const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
	return (meta ? meta[key] : undefined) ?? process.env[key];
}

/**
 * Resolve config. KV `settings:*` (admin-configurable) wins over environment
 * variables so the host app can override without code changes — same pattern
 * as the email-client plugin.
 */
async function resolveConfig(ctx: PluginContext): Promise<CartConfig> {
	const kv = async (key: string) => (await ctx.kv.get<string>(`settings:${key}`)) ?? undefined;

	return {
		secretKey: (await kv("stripeSecretKey")) ?? readEnv("STRIPE_SECRET_KEY"),
		publishableKey: (await kv("stripePublishableKey")) ?? readEnv("PUBLIC_STRIPE_PUBLISHABLE_KEY"),
		webhookSecret: (await kv("stripeWebhookSecret")) ?? readEnv("STRIPE_WEBHOOK_SECRET"),
		currency: ((await kv("currency")) ?? readEnv("CART_CURRENCY") ?? "czk").toLowerCase(),
		productsCollection:
			(await kv("productsCollection")) ?? readEnv("CART_PRODUCTS_COLLECTION") ?? "products",
		siteOrigin: (await kv("siteOrigin")) ?? readEnv("EMDASH_SITE_URL") ?? readEnv("SITE_URL"),
		successPath: (await kv("successPath")) ?? readEnv("CART_SUCCESS_PATH") ?? "/checkout/success",
		cancelPath: (await kv("cancelPath")) ?? readEnv("CART_CANCEL_PATH") ?? "/checkout/cancel",
		adminEmail: (await kv("adminEmail")) ?? readEnv("CART_ADMIN_EMAIL") ?? readEnv("EMAIL_FROM"),
	};
}

function makeStripe(secretKey: string): Stripe {
	// Pin the API version to the one this SDK (stripe@17) was built against;
	// bump deliberately after testing against Stripe changelogs.
	return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

function newId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** True only when the request's host is loopback — the gate for mock mode. */
function isLocalhostRequest(request: Request): boolean {
	try {
		const host = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
		return host === "localhost" || host === "127.0.0.1" || host === "::1";
	} catch {
		return false;
	}
}

const checkoutInput = z.object({
	items: z
		.array(
			z.object({
				productId: z.string().min(1),
				quantity: z.number().int().min(1).max(99).default(1),
			}),
		)
		.min(1, "Cart is empty"),
	email: z.string().email().optional(),
	// Souhlas s obchodními podmínkami a GDPR (povinný, viz checkout stránka).
	consent: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Admin (Block Kit) — orders list with status changes + deletion.
// Mounted at /_emdash/admin/plugins/stripe-cart/orders (see `adminPages`).
// ---------------------------------------------------------------------------

const ORDERS_PAGE = "/orders";

type OrderStatus = "pending" | "paid" | "refunded" | "cancelled";

interface OrderItem {
	productId: string;
	title: string;
	unitAmount: number;
	quantity: number;
}

interface OrderConsent {
	/** Verze obchodních podmínek odsouhlasená zákazníkem. */
	termsVersion: string;
	/** ISO čas udělení souhlasu. */
	consentedAt: string;
}

interface OrderRecord {
	sessionId: string;
	status: OrderStatus;
	test?: boolean;
	email?: string | null;
	currency: string;
	items: OrderItem[];
	amountTotal?: number;
	/** Záznam souhlasu s VOP/GDPR (důkaz). */
	consent?: OrderConsent;
	/** Pořadové číslo daňového dokladu, přidělené při přechodu na `paid`. */
	invoiceNumber?: string;
	createdAt: string;
	updatedAt: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
	pending: "Čeká na platbu",
	paid: "Zaplaceno",
	refunded: "Refundováno",
	cancelled: "Stornováno",
};

const ALL_STATUSES: OrderStatus[] = ["pending", "paid", "refunded", "cancelled"];

/** Filter tabs shown above the list. "all" maps to an unfiltered query. */
const FILTERS: Array<{ value: string; label: string }> = [
	{ value: "all", label: "Vše" },
	{ value: "paid", label: "Zaplacené" },
	{ value: "pending", label: "Čekající" },
	{ value: "refunded", label: "Refundované" },
	{ value: "cancelled", label: "Stornované" },
];

/** Most recent N orders rendered per view. Pagination can come later. */
const LIST_LIMIT = 100;

function isOrderStatus(v: unknown): v is OrderStatus {
	return typeof v === "string" && (ALL_STATUSES as string[]).includes(v);
}

function normalizeFilter(v: unknown): string {
	return typeof v === "string" && FILTERS.some((f) => f.value === v) ? v : "all";
}

/** Minor units (e.g. 59000) -> "590,00 Kč". */
function formatMoney(minorUnits: number, currency: string): string {
	const amount = (Number(minorUnits) || 0) / 100;
	try {
		return new Intl.NumberFormat("cs-CZ", {
			style: "currency",
			currency: currency.toUpperCase(),
		}).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
	}
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("cs-CZ");
}

/** Authoritative order total: the recorded amount, else summed from items. */
function orderTotal(order: OrderRecord): number {
	if (typeof order.amountTotal === "number") return order.amountTotal;
	return (order.items ?? []).reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);
}

/**
 * Send the order confirmation (to the customer) and a new-order notification
 * (to the shop operator). Called once when an order becomes `paid`.
 *
 * Best-effort: every send is isolated in try/catch so a mail failure never
 * breaks checkout or the Stripe webhook. With no SMTP configured the
 * email-client plugin falls back to a JSON transport, so locally these are
 * logged rather than delivered.
 */
async function sendOrderEmails(ctx: PluginContext, order: OrderEmailData): Promise<void> {
	if (!ctx.email) {
		ctx.log.warn("No email provider available — skipping order e-mails", { order: order.id });
		return;
	}
	const config = await resolveConfig(ctx);

	// Signed link to the customer's invoice (e-mails can't carry attachments).
	if (order.id && !order.invoiceUrl) {
		const inv = resolveInvoiceConfig(order.currency);
		order.invoiceUrl = await invoiceUrlFor(order.id, config.siteOrigin, inv.tokenSecret);
	}

	if (order.email) {
		try {
			const mail = renderCustomerOrderEmail(order);
			await ctx.email.send({ to: order.email, ...mail });
			ctx.log.info("Order confirmation e-mail sent", { to: order.email, order: order.id });
		} catch (err) {
			ctx.log.warn("Order confirmation e-mail failed", { err: String(err), order: order.id });
		}
	} else {
		ctx.log.warn("Order has no customer e-mail — confirmation skipped", { order: order.id });
	}

	if (config.adminEmail) {
		try {
			const mail = renderAdminOrderEmail(order);
			await ctx.email.send({ to: config.adminEmail, ...mail });
			ctx.log.info("New-order notification sent to admin", { to: config.adminEmail, order: order.id });
		} catch (err) {
			ctx.log.warn("Admin order notification failed", { err: String(err), order: order.id });
		}
	}
}

// ---------------------------------------------------------------------------
// Invoice (daňový doklad) — numbering, signed link, rendering.
// Seller/VAT config comes from env (LEGAL_*) to keep the plugin sandbox
// decoupled from src/config/legal.ts; keep the two in sync.
// ---------------------------------------------------------------------------

/** Terms version recorded with each order's consent. */
function termsVersion(): string {
	return readEnv("LEGAL_TERMS_VERSION") ?? "2026-01";
}

/** Resolve seller identity + VAT mode for the invoice from env. */
function resolveInvoiceConfig(currency: string): InvoiceConfig & { tokenSecret: string } {
	return {
		seller: {
			name: readEnv("LEGAL_SELLER_NAME") ?? "PLACEHOLDER s.r.o.",
			ico: readEnv("LEGAL_SELLER_ICO") ?? "00000000",
			dic: readEnv("LEGAL_SELLER_DIC") ?? "CZ00000000",
			address: readEnv("LEGAL_SELLER_ADDRESS") ?? "Ulice 1, 110 00 Praha 1",
			email: readEnv("LEGAL_SELLER_EMAIL") ?? "info@example.cz",
			phone: readEnv("LEGAL_SELLER_PHONE") ?? "+420 000 000 000",
			note: readEnv("LEGAL_SELLER_NOTE") ?? undefined,
		},
		vatPayer: (readEnv("LEGAL_VAT_PAYER") ?? "false") === "true",
		vatRate: Number(readEnv("LEGAL_VAT_RATE") ?? "21") || 21,
		// HMAC secret for the invoice link; falls back so dev keeps working.
		tokenSecret:
			readEnv("INVOICE_TOKEN_SECRET") ??
			readEnv("STRIPE_WEBHOOK_SECRET") ??
			readEnv("STRIPE_SECRET_KEY") ??
			"dev-insecure-invoice-secret",
		currency,
	} as InvoiceConfig & { tokenSecret: string };
}

/** Next sequential invoice number like "2026-0001" (per-year counter in KV). */
async function nextInvoiceNumber(ctx: PluginContext): Promise<string> {
	const year = new Date().getFullYear();
	const key = `state:invoiceSeq:${year}`;
	const current = (await ctx.kv.get<number>(key)) ?? 0;
	const next = current + 1;
	await ctx.kv.set(key, next);
	return `${year}-${String(next).padStart(4, "0")}`;
}

/** base64url(HMAC-SHA256(orderId)) — signs the public invoice link. */
async function invoiceToken(orderId: string, secret: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(orderId));
	let bin = "";
	for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time-ish token check. */
async function verifyInvoiceToken(orderId: string, token: string, secret: string): Promise<boolean> {
	const expected = await invoiceToken(orderId, secret);
	if (expected.length !== token.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}

/** Build the absolute, signed invoice URL for a paid order. */
async function invoiceUrlFor(
	orderId: string,
	siteOrigin: string | undefined,
	secret: string,
): Promise<string | undefined> {
	const origin = (siteOrigin ?? "").replace(/\/$/, "");
	if (!origin) return undefined;
	const token = await invoiceToken(orderId, secret);
	return `${origin}/faktura/${encodeURIComponent(orderId)}?t=${token}`;
}

/** Build the full orders page for the given filter. */
async function ordersListBlocks(ctx: PluginContext, filter: string): Promise<unknown[]> {
	const orders = ctx.storage.orders!;
	const currency = (await resolveConfig(ctx)).currency;

	// Headline stats over the whole collection (independent of the filter).
	const [totalCount, paidCount, pendingCount] = await Promise.all([
		orders.count(),
		orders.count({ status: "paid" }),
		orders.count({ status: "pending" }),
	]);
	// No orderBy here: only single-field indexes exist, so combining a `status`
	// filter with a `createdAt` ordering isn't supported — we sort in memory.
	const paid = await orders.query({ where: { status: "paid" }, limit: 1000 });
	const revenue = paid.items.reduce(
		(sum: number, row: { data: unknown }) => sum + orderTotal(row.data as OrderRecord),
		0,
	);

	// The filtered list itself. "all" can order by the createdAt index directly;
	// a status filter uses the status index and is sorted newest-first in memory.
	const result =
		filter === "all"
			? await orders.query({ orderBy: { createdAt: "desc" }, limit: LIST_LIMIT })
			: await orders.query({ where: { status: filter }, limit: LIST_LIMIT });
	const rows = (result.items as Array<{ id: string; data: OrderRecord }>)
		.slice()
		.sort((a, b) => (a.data.createdAt < b.data.createdAt ? 1 : -1));

	const blocks: unknown[] = [
		{ type: "header", text: "Objednávky" },
		{
			type: "stats",
			items: [
				{ label: "Objednávky", value: totalCount },
				{ label: "Zaplacené", value: paidCount },
				{ label: "Čekající", value: pendingCount },
				{ label: "Obrat (zaplaceno)", value: formatMoney(revenue, currency) },
			],
		},
		{
			type: "actions",
			elements: FILTERS.map((f) => ({
				type: "button",
				action_id: "filter",
				label: f.label,
				style: f.value === filter ? "primary" : "secondary",
				value: { filter: f.value },
			})),
		},
	];

	if (rows.length === 0) {
		blocks.push({
			type: "banner",
			description: "Žádné objednávky v tomto filtru.",
			variant: "default",
		});
		return blocks;
	}

	for (const { id, data } of rows) {
		const total = orderTotal(data);
		const label =
			`${formatDate(data.createdAt)} · ${data.email || "—"} · ` +
			`${formatMoney(total, data.currency || currency)} · ${STATUS_LABELS[data.status] ?? data.status}` +
			(data.test ? " · TEST" : "");

		// Status buttons for every status except the current one, plus delete.
		const statusButtons = ALL_STATUSES.filter((s) => s !== data.status).map((s) => ({
			type: "button",
			action_id: "set_status",
			label: `→ ${STATUS_LABELS[s]}`,
			style: s === "paid" ? "primary" : "secondary",
			value: { id, status: s, filter },
		}));

		blocks.push({
			type: "accordion",
			label,
			default_open: false,
			blocks: [
				{
					type: "fields",
					fields: [
						{ label: "ID objednávky", value: id },
						{ label: "Stripe session", value: data.sessionId ?? "—" },
						{ label: "E-mail", value: data.email || "—" },
						{ label: "Stav", value: STATUS_LABELS[data.status] ?? data.status },
						{ label: "Vytvořeno", value: formatDate(data.createdAt) },
						{ label: "Aktualizováno", value: formatDate(data.updatedAt) },
						{ label: "Testovací", value: data.test ? "Ano" : "Ne" },
						{ label: "Číslo dokladu", value: data.invoiceNumber ?? "—" },
						{
							label: "Souhlas s podmínkami",
							value: data.consent
								? `verze ${data.consent.termsVersion} · ${formatDate(data.consent.consentedAt)}`
								: "—",
						},
					],
				},
				{
					type: "table",
					page_action_id: "noop",
					empty_text: "Bez položek.",
					columns: [
						{ key: "title", label: "Položka" },
						{ key: "quantity", label: "Ks", format: "number" },
						{ key: "unit", label: "Cena/ks" },
						{ key: "sum", label: "Celkem" },
					],
					rows: (data.items ?? []).map((it) => ({
						title: it.title,
						quantity: it.quantity,
						unit: formatMoney(it.unitAmount, data.currency || currency),
						sum: formatMoney(it.unitAmount * it.quantity, data.currency || currency),
					})),
				},
				{
					type: "actions",
					elements: [
						...statusButtons,
						{
							type: "button",
							action_id: "delete_order",
							label: "Smazat",
							style: "danger",
							value: { id, filter },
							confirm: {
								title: "Smazat objednávku?",
								text: "Tuto akci nelze vrátit zpět.",
								confirm: "Smazat",
								deny: "Zrušit",
								style: "danger",
							},
						},
					],
				},
			],
		});
	}

	return blocks;
}

export default definePlugin({
	routes: {
		// Public: storefront bootstrap (publishable key is safe to expose).
		config: {
			public: true,
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const config = await resolveConfig(ctx);
				return {
					publishableKey: config.publishableKey ?? null,
					currency: config.currency,
					configured: Boolean(config.secretKey),
				};
			},
		},

		// Public: create a Stripe Checkout Session from a cart of product ids.
		// Returns { url, sessionId } on success, or { error } on any failure.
		checkout: {
			public: true,
			input: checkoutInput,
			handler: async (
				routeCtx: { input: z.infer<typeof checkoutInput>; request: Request },
				ctx: PluginContext,
			) => {
				const config = await resolveConfig(ctx);

				// Localhost-only mock mode: lets you exercise the full cart flow
				// without real Stripe keys. Double-gated — requires CART_TEST_MODE=true
				// AND the request to actually come from localhost, so it can never
				// activate on a deployed (VPS) host.
				const testMode = isLocalhostRequest(routeCtx.request) && readEnv("CART_TEST_MODE") === "true";

				if (!testMode && !config.secretKey) {
					return { error: "Stripe není nakonfigurován — nastavte STRIPE_SECRET_KEY." };
				}
				const origin = (config.siteOrigin ?? "").replace(/\/$/, "");
				if (!origin) {
					return { error: "Chybí EMDASH_SITE_URL — nelze sestavit návratové adresy." };
				}

				const { items, email, consent } = routeCtx.input;

				// Consent with terms/GDPR is mandatory (recorded with the order).
				if (!consent) {
					return { error: "Pro dokončení objednávky je nutný souhlas s obchodními podmínkami." };
				}
				const consentRecord: OrderConsent = {
					termsVersion: termsVersion(),
					consentedAt: new Date().toISOString(),
				};

				// Resolve every line item against the CMS — the price authority.
				const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
				const orderItems: Array<{
					productId: string;
					title: string;
					unitAmount: number;
					quantity: number;
				}> = [];

				for (const { productId, quantity } of items) {
					const product = await ctx.content!.get(config.productsCollection, productId);
					if (!product) {
						return { error: `Neznámý produkt: ${productId}` };
					}
					const data = (product.data ?? {}) as Record<string, unknown>;

					// If the product carries a Stripe Price id, prefer it (handles tax/recurring).
					const stripePriceId =
						typeof data.stripe_price_id === "string" ? data.stripe_price_id : undefined;
					if (stripePriceId) {
						lineItems.push({ price: stripePriceId, quantity });
						orderItems.push({
							productId,
							title: String(data.title ?? productId),
							unitAmount: 0, // price owned by Stripe
							quantity,
						});
						continue;
					}

					// Otherwise build price_data from the CMS price (major units -> minor units).
					const price = Number(data.price);
					if (!Number.isFinite(price) || price <= 0) {
						return { error: `Produkt ${productId} nemá platnou cenu.` };
					}
					const unitAmount = Math.round(price * 100);
					const image =
						data.image && typeof data.image === "object"
							? (data.image as { src?: string }).src
							: undefined;

					lineItems.push({
						quantity,
						price_data: {
							currency: config.currency,
							unit_amount: unitAmount,
							product_data: {
								name: String(data.title ?? productId),
								...(image ? { images: [image] } : {}),
							},
						},
					});
					orderItems.push({
						productId,
						title: String(data.title ?? productId),
						unitAmount,
						quantity,
					});
				}

				// Mock mode: skip Stripe, record a simulated paid order, and send the
				// browser straight to the success page. Prices/products above are still
				// resolved from the CMS, so the whole flow is exercised except Stripe.
				if (testMode) {
					const sessionId = `test_${newId()}`;
					const orderId = newId();
					const invoiceNumber = await nextInvoiceNumber(ctx);
					await ctx.storage.orders!.put(orderId, {
						sessionId,
						status: "paid",
						test: true,
						email: email ?? null,
						currency: config.currency,
						items: orderItems,
						amountTotal: orderItems.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0),
						consent: consentRecord,
						invoiceNumber,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					});
					ctx.log.warn("CART_TEST_MODE: bypassing Stripe, simulated paid order", { sessionId });
					await sendOrderEmails(ctx, {
						id: orderId,
						sessionId,
						status: "paid",
						test: true,
						email: email ?? null,
						currency: config.currency,
						items: orderItems,
						amountTotal: orderItems.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0),
					});
					return {
						url: `${origin}${config.successPath}?session_id=${sessionId}&test=1`,
						sessionId,
						test: true,
					};
				}

				const stripe = makeStripe(config.secretKey!);
				let session: Stripe.Checkout.Session;
				try {
					session = await stripe.checkout.sessions.create({
						mode: "payment",
						line_items: lineItems,
						...(email ? { customer_email: email } : {}),
						success_url: `${origin}${config.successPath}?session_id={CHECKOUT_SESSION_ID}`,
						cancel_url: `${origin}${config.cancelPath}`,
					});
				} catch (err) {
					ctx.log.error("Stripe checkout session creation failed", { err: String(err) });
					return { error: `Stripe: ${err instanceof Error ? err.message : String(err)}` };
				}

				// Record a pending order; the webhook flips it to `paid` and assigns
				// the invoice number then.
				await ctx.storage.orders!.put(newId(), {
					sessionId: session.id,
					status: "pending",
					email: email ?? null,
					currency: config.currency,
					items: orderItems,
					consent: consentRecord,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				return { url: session.url, sessionId: session.id };
			},
		},

		// Public: Stripe webhook. Verifies the signature against the RAW body,
		// so this route deliberately declares no `input` schema (which would
		// consume/parse the body before we can verify it). Throws on failure so
		// Stripe sees a non-2xx and retries.
		webhook: {
			public: true,
			handler: async (routeCtx: { request: Request }, ctx: PluginContext) => {
				const config = await resolveConfig(ctx);
				if (!config.secretKey || !config.webhookSecret) {
					throw new Error("Stripe webhook not configured");
				}
				const stripe = makeStripe(config.secretKey);

				const signature = routeCtx.request.headers.get("stripe-signature");
				if (!signature) throw new Error("Missing stripe-signature header");

				const rawBody = await routeCtx.request.text();
				let event: Stripe.Event;
				try {
					event = await stripe.webhooks.constructEventAsync(
						rawBody,
						signature,
						config.webhookSecret,
					);
				} catch (err) {
					ctx.log.warn("Stripe webhook signature verification failed", { err: String(err) });
					throw new Error("Invalid webhook signature");
				}

				if (event.type === "checkout.session.completed") {
					const session = event.data.object as Stripe.Checkout.Session;
					const existing = await ctx.storage.orders!.query({
						where: { sessionId: session.id },
						limit: 1,
					});
					const record = existing.items[0];
					if (record) {
						const prev = record.data as OrderRecord;
						// Only the first pending -> paid transition fires e-mails, so a
						// retried/duplicate webhook delivery won't double-send.
						const wasPaid = prev.status === "paid";
						const email = session.customer_details?.email ?? prev.email ?? null;
						const amountTotal = session.amount_total ?? undefined;
						// Assign the invoice number on the first transition to paid.
						let invoiceNumber = prev.invoiceNumber;
						if (!wasPaid && !invoiceNumber) invoiceNumber = await nextInvoiceNumber(ctx);
						await ctx.storage.orders!.put(record.id, {
							...prev,
							status: "paid",
							email,
							amountTotal,
							invoiceNumber,
							updatedAt: new Date().toISOString(),
						});
						ctx.log.info(`Order paid: ${session.id}`, { amountTotal: session.amount_total });
						if (!wasPaid) {
							await sendOrderEmails(ctx, {
								id: record.id,
								sessionId: prev.sessionId,
								status: "paid",
								test: prev.test,
								email,
								currency: prev.currency,
								items: prev.items,
								amountTotal,
							});
						}
					} else {
						ctx.log.warn(`Webhook for unknown session: ${session.id}`);
					}
				}

				// 200 so Stripe stops retrying handled events.
				return { received: true };
			},
		},

		// Public: render the tax document (invoice) for a paid order, gated by an
		// HMAC token in the URL (?id=...&t=...). Returns { html } for the Astro
		// page at /faktura/[id] to output. Never exposes unpaid/foreign orders.
		invoice: {
			public: true,
			handler: async (routeCtx: { request: Request }, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const id = url.searchParams.get("id") ?? "";
				const token = url.searchParams.get("t") ?? "";
				if (!id || !token) return { error: "Chybí identifikátor dokladu." };

				const inv = resolveInvoiceConfig((await resolveConfig(ctx)).currency);
				if (!(await verifyInvoiceToken(id, token, inv.tokenSecret))) {
					return { error: "Neplatný odkaz na doklad." };
				}

				const order = (await ctx.storage.orders!.get(id)) as OrderRecord | null;
				if (!order) return { error: "Doklad nenalezen." };
				if (order.status !== "paid") {
					return { error: "Doklad je k dispozici až po zaplacení objednávky." };
				}

				const html = renderInvoiceHtml(
					{
						invoiceNumber: order.invoiceNumber ?? id,
						orderId: id,
						createdAt: order.createdAt,
						email: order.email,
						currency: order.currency,
						items: order.items,
						amountTotal: order.amountTotal,
						test: order.test,
					},
					inv,
				);
				return { html };
			},
		},

		// Block Kit admin page (/orders) — lists orders, changes their status,
		// and deletes them. Reads/writes the plugin `orders` storage collection.
		admin: {
			handler: async (
				routeCtx: { input?: unknown },
				ctx: PluginContext,
			): Promise<{ blocks: unknown[]; toast?: { message: string; type: string } }> => {
				const interaction = (routeCtx.input ?? {}) as {
					type?: string;
					page?: string;
					action_id?: string;
					value?: Record<string, unknown>;
				};
				const orders = ctx.storage.orders!;

				if (interaction.type === "page_load" && interaction.page === ORDERS_PAGE) {
					return { blocks: await ordersListBlocks(ctx, "all") };
				}

				if (interaction.type === "block_action") {
					const value = (interaction.value ?? {}) as Record<string, unknown>;
					const filter = normalizeFilter(value.filter);

					if (interaction.action_id === "filter") {
						return { blocks: await ordersListBlocks(ctx, filter) };
					}

					if (interaction.action_id === "set_status") {
						const id = typeof value.id === "string" ? value.id : "";
						const status = value.status;
						if (id && isOrderStatus(status)) {
							const data = (await orders.get(id)) as OrderRecord | null;
							if (data) {
								await orders.put(id, {
									...data,
									status,
									updatedAt: new Date().toISOString(),
								});
								return {
									blocks: await ordersListBlocks(ctx, filter),
									toast: { message: `Stav změněn na „${STATUS_LABELS[status]}".`, type: "success" },
								};
							}
						}
						return {
							blocks: await ordersListBlocks(ctx, filter),
							toast: { message: "Objednávku se nepodařilo aktualizovat.", type: "error" },
						};
					}

					if (interaction.action_id === "delete_order") {
						const id = typeof value.id === "string" ? value.id : "";
						const deleted = id ? await orders.delete(id) : false;
						return {
							blocks: await ordersListBlocks(ctx, filter),
							toast: deleted
								? { message: "Objednávka smazána.", type: "success" }
								: { message: "Objednávka nenalezena.", type: "error" },
						};
					}

					// Unknown / no-op action (e.g. the item-table page action) — just
					// re-render the current view.
					return { blocks: await ordersListBlocks(ctx, filter) };
				}

				return { blocks: await ordersListBlocks(ctx, "all") };
			},
		},
	},
});
