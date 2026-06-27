import type { PluginDescriptor } from "emdash";

/**
 * Stripe cart plugin (descriptor).
 *
 * Runs in Vite at build time — must stay side-effect-free. The runtime logic
 * lives in `./sandbox-entry.ts` (referenced via `entrypoint`).
 *
 * Provides a Stripe Checkout flow backed by the EmDash `products` collection:
 * the client posts a cart of { productId, quantity }, the plugin looks up the
 * *authoritative* price from the CMS (never trusting the client), creates a
 * Stripe Checkout Session, and records the order. A webhook route confirms
 * payment and flips the order to `paid`.
 *
 * Node-only (uses the `stripe` SDK directly), so it runs in trusted mode and
 * reads its keys from environment variables — see sandbox-entry.ts.
 */
export function stripeCartPlugin(): PluginDescriptor {
	return {
		id: "stripe-cart",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@local/plugin-stripe-cart/sandbox",
		options: {},
		// read:content -> look up authoritative product prices via ctx.content.get()
		// network:fetch -> documents the outbound Stripe API access (advisory in trusted mode)
		capabilities: ["read:content", "network:fetch"],
		allowedHosts: ["api.stripe.com"],
		storage: {
			orders: { indexes: ["sessionId", "status", "email", "createdAt"] },
		},
		// Block Kit admin page listing orders, with status changes and deletion.
		// The "/orders" path is handled by the `admin` route in sandbox-entry.ts.
		adminPages: [{ path: "/orders", label: "Objednávky", icon: "shopping-cart" }],
	};
}

export default stripeCartPlugin;
