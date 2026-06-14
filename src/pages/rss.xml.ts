import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettings } from "emdash";

export const GET: APIRoute = async ({ url }) => {
	const settings = await getSiteSettings();
	const siteTitle = settings.title || "My Site";
	const siteUrl = url.origin;
	
	const { entries: galleries } = await getEmDashCollection("galleries", {
		orderBy: { published_at: "desc" },
		limit: 20,
	});

	const items = galleries
		.filter((p) => p.data.publishedAt)
		.map((gallery) => {
			const galleryUrl = `${siteUrl}/galerie/${gallery.id}`;
			return `    <item>
      <title>${escapeXml(gallery.data.title)}</title>
      <link>${galleryUrl}</link>
      <guid isPermaLink="true">${galleryUrl}</guid>
      <pubDate>${gallery.data.publishedAt!.toUTCString()}</pubDate>
      <description>${escapeXml(gallery.data.note || gallery.data.address || "")}</description>
    </item>`;
		})
		.join("\n");

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>cs</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`,
		{
			headers: {
				"Content-Type": "application/rss+xml; charset=utf-8",
				"Cache-Control": "public, max-age=3600",
			},
		},
	);
};

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
