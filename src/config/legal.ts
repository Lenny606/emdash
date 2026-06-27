/**
 * Centrální legislativní konfigurace e-shopu — jediný zdroj pravdy.
 *
 * Vše se ladí zde v kódu. PLACEHOLDER hodnoty níže nahraď reálnými údaji
 * provozovatele a nech právní texty zkontrolovat právníkem.
 *
 * Pozn.: plugin (stripe-cart) běží v sandboxu a tento soubor neimportuje —
 * čte si potřebné hodnoty z proměnných prostředí (LEGAL_*, INVOICE_*).
 * Drž je proto v souladu (viz `.env`).
 */

export interface SellerIdentity {
	name: string;
	ico: string;
	dic: string;
	address: string;
	email: string;
	phone: string;
	/** Doplňující věta do dokladu (zápis v rejstříku apod.). */
	note?: string;
}

export const LEGAL = {
	/** Údaje prodejce — PLACEHOLDER, doplnit. */
	seller: {
		name: "PLACEHOLDER s.r.o.",
		ico: "00000000",
		dic: "CZ00000000",
		address: "Ulice 1, 110 00 Praha 1",
		email: "info@example.cz",
		phone: "+420 000 000 000",
		note: "Zapsáno v obchodním rejstříku — PLACEHOLDER.",
	} satisfies SellerIdentity,

	/** Přepínač: true = plátce DPH (doklad s DPH), false = neplátce. */
	vatPayer: false,

	/** Sazba DPH v procentech (použije se jen když vatPayer === true). */
	vatRate: 21,

	/** Verze obchodních podmínek — ukládá se k objednávce jako důkaz souhlasu. */
	termsVersion: "2026-01",

	/** Slugy právních stránek (statické stránky v src/pages/). */
	pages: {
		terms: "obchodni-podminky",
		privacy: "ochrana-osobnich-udaju",
		complaints: "reklamacni-rad",
		withdrawal: "odstoupeni-od-smlouvy",
	},
} as const;

/** Odkaz na právní stránku podle klíče. */
export function legalHref(key: keyof typeof LEGAL.pages): string {
	return `/${LEGAL.pages[key]}`;
}
