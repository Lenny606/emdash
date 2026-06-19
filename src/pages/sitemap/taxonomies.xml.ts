/**
 * Supplementary sitemap for taxonomy archive pages (districts, categories) and
 * their index pages. EmDash's built-in /sitemap.xml is collection-based and
 * cannot include taxonomy routes, so they are listed here and referenced from
 * robots.txt alongside the main sitemap.
 */
import type { APIRoute } from "astro";
import { getTaxonomyTerms } from "emdash";

export const prerender = false;

const TRAILING_SLASH_RE = /\/$/;

const escapeXml = (str: string): string =>
	str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

export const GET: APIRoute = async (context) => {
	const base = (context.site?.href ?? context.url.origin).replace(TRAILING_SLASH_RE, "");

	const paths: string[] = ["/", "/obvod", "/kategorie"];

	const districts = await getTaxonomyTerms("district");
	for (const term of districts) paths.push(`/obvod/${encodeURIComponent(term.slug)}`);

	const categories = await getTaxonomyTerms("gallery_category");
	for (const term of categories) paths.push(`/kategorie/${encodeURIComponent(term.slug)}`);

	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...paths.map((path) => `  <url>\n    <loc>${escapeXml(base + path)}</loc>\n  </url>`),
		"</urlset>",
	].join("\n");

	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
