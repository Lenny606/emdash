import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { emailClientPlugin } from "@emdash-cms/plugin-email-client";
import { google } from "emdash/auth/providers/google";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			// Trusted (in-process) plugins — runs in Node, uses nodemailer.
			plugins: [emailClientPlugin()],
			authProviders: [google()],
			siteUrl: process.env.EMDASH_SITE_URL || process.env.SITE_URL || undefined,
			allowedOrigins: process.env.EMDASH_ALLOWED_ORIGINS ? [process.env.EMDASH_ALLOWED_ORIGINS] : undefined,
		}),
	],
	devToolbar: { enabled: false },
	site: "https://www.previweb.site"
});
