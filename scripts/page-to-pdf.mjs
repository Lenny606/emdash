import { chromium } from "playwright-core";

const EXEC = "/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const URL = process.env.URL || "http://localhost:4321/prestige";
const OUT = process.env.OUT || "stitch-export/prestige.pdf";
const WIDTH = Number(process.env.WIDTH || 1280);

const browser = await chromium.launch({
	executablePath: EXEC,
	args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({
	viewport: { width: WIDTH, height: 900 },
	deviceScaleFactor: 2,
});

await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

// Scroll through the page to trigger lazy-loaded images, then wait for them.
await page.evaluate(async () => {
	await new Promise((resolve) => {
		let y = 0;
		const step = window.innerHeight;
		const timer = setInterval(() => {
			window.scrollTo(0, y);
			y += step;
			if (y >= document.body.scrollHeight) {
				clearInterval(timer);
				resolve();
			}
		}, 120);
	});
	window.scrollTo(0, 0);
});
await page.evaluate(() =>
	Promise.all(
		Array.from(document.images)
			.filter((img) => !img.complete)
			.map(
				(img) =>
					new Promise((res) => {
						img.onload = img.onerror = res;
					})
			)
	)
);
await page.waitForTimeout(800);

// Full-page screenshot for pixel-faithful capture (incl. backgrounds).
const shot = await page.screenshot({ fullPage: true, type: "png" });
const { w, h } = await page.evaluate(() => ({
	w: document.documentElement.scrollWidth,
	h: document.documentElement.scrollHeight,
}));

// Embed the screenshot into a single-page PDF sized exactly to the page.
const b64 = shot.toString("base64");
const wrapper = await browser.newPage();
await wrapper.setContent(
	`<!doctype html><html><head><style>
		@page { size: ${w}px ${h}px; margin: 0 }
		html,body { margin:0; padding:0 }
		img { display:block; width:${w}px; height:${h}px }
	</style></head><body><img src="data:image/png;base64,${b64}"></body></html>`,
	{ waitUntil: "load" }
);
await wrapper.pdf({
	path: OUT,
	width: `${w}px`,
	height: `${h}px`,
	printBackground: true,
	pageRanges: "1",
	preferCSSPageSize: true,
});

await browser.close();
console.log(`PDF saved -> ${OUT}  (${w}x${h}px)`);
