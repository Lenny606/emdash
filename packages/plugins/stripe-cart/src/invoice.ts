/**
 * Daňový doklad / faktura (HTML, upravuje se v kódu).
 *
 * Self-contained, sandbox-safe (jen string templating). Větví se podle
 * `vatPayer` (plátce / neplátce DPH) — přepínač řídí volající přes env
 * (LEGAL_VAT_PAYER), viz `sandbox-entry.ts` / `src/config/legal.ts`.
 *
 * E-maily v EmDash nemají přílohy, takže doklad se zobrazuje jako webová
 * stránka (/faktura/[id]) a do PDF si ho zákazník vytiskne (@media print).
 */

export interface InvoiceSeller {
	name: string;
	ico: string;
	dic: string;
	address: string;
	email: string;
	phone: string;
	note?: string;
}

export interface InvoiceConfig {
	seller: InvoiceSeller;
	/** true = plátce DPH (rozpad základ/DPH), false = neplátce. */
	vatPayer: boolean;
	/** Sazba DPH v procentech (platí jen pro plátce). */
	vatRate: number;
}

export interface InvoiceItem {
	title: string;
	unitAmount: number; // minor units (590.00 = 59000)
	quantity: number;
}

export interface InvoiceData {
	invoiceNumber: string;
	orderId: string;
	createdAt: string;
	email?: string | null;
	currency: string;
	items: InvoiceItem[];
	amountTotal?: number;
	test?: boolean;
}

function money(minorUnits: number, currency: string): string {
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

function total(inv: InvoiceData): number {
	if (typeof inv.amountTotal === "number") return inv.amountTotal;
	return (inv.items ?? []).reduce((s, i) => s + i.unitAmount * i.quantity, 0);
}

function dateCs(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("cs-CZ");
}

function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function itemRows(inv: InvoiceData): string {
	return (inv.items ?? [])
		.map(
			(i) =>
				`<tr>` +
				`<td>${esc(i.title)}</td>` +
				`<td class="num">${i.quantity}</td>` +
				`<td class="num">${esc(money(i.unitAmount, inv.currency))}</td>` +
				`<td class="num">${esc(money(i.unitAmount * i.quantity, inv.currency))}</td>` +
				`</tr>`,
		)
		.join("");
}

/** Souhrn dle režimu DPH. */
function summaryRows(inv: InvoiceData, cfg: InvoiceConfig): string {
	const grand = total(inv);
	if (!cfg.vatPayer) {
		return (
			`<tr class="grand"><th>Celkem k úhradě</th><td class="num">${esc(money(grand, inv.currency))}</td></tr>` +
			`<tr><td colspan="2" class="note">Prodávající není plátcem DPH.</td></tr>`
		);
	}
	// Ceny jsou uvedeny včetně DPH → zpětný rozpad základu a daně.
	const rate = cfg.vatRate;
	const base = Math.round(grand / (1 + rate / 100));
	const vat = grand - base;
	return (
		`<tr><th>Základ daně</th><td class="num">${esc(money(base, inv.currency))}</td></tr>` +
		`<tr><th>DPH ${rate} %</th><td class="num">${esc(money(vat, inv.currency))}</td></tr>` +
		`<tr class="grand"><th>Celkem k úhradě</th><td class="num">${esc(money(grand, inv.currency))}</td></tr>`
	);
}

export function renderInvoiceHtml(inv: InvoiceData, cfg: InvoiceConfig): string {
	const s = cfg.seller;
	const docTitle = cfg.vatPayer ? "Faktura — daňový doklad" : "Doklad o prodeji";

	return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(docTitle)} ${esc(inv.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 32px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 13px; }
  .parties { display: flex; gap: 32px; flex-wrap: wrap; margin: 24px 0; }
  .party { flex: 1 1 220px; }
  .party h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; }
  thead th { border-bottom: 2px solid #1a1a1a; font-size: 12px; text-transform: uppercase; }
  tbody td { border-bottom: 1px solid #eee; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .summary { width: auto; min-width: 280px; margin-left: auto; }
  .summary th { font-weight: normal; color: #444; }
  .summary .grand th, .summary .grand td { font-weight: bold; border-top: 2px solid #1a1a1a; font-size: 16px; }
  .summary .note { color: #666; font-size: 12px; padding-top: 8px; }
  .test { display: inline-block; background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-top: 8px; }
  .actions { margin: 24px 0; }
  .btn { display: inline-block; padding: 8px 16px; border: 1px solid #1a1a1a; border-radius: 6px; background: #1a1a1a; color: #fff; cursor: pointer; font-size: 14px; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style>
</head><body>
  <div class="head">
    <div>
      <h1>${esc(docTitle)}</h1>
      <div class="muted">Číslo dokladu: <strong>${esc(inv.invoiceNumber)}</strong></div>
      <div class="muted">Datum vystavení: ${esc(dateCs(inv.createdAt))}</div>
      <div class="muted">Variabilní symbol / objednávka: ${esc(inv.orderId)}</div>
      ${inv.test ? `<div class="test">TESTOVACÍ DOKLAD</div>` : ""}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h2>Dodavatel</h2>
      <strong>${esc(s.name)}</strong><br />
      ${esc(s.address)}<br />
      IČO: ${esc(s.ico)}${cfg.vatPayer ? ` · DIČ: ${esc(s.dic)}` : " · Neplátce DPH"}<br />
      ${esc(s.email)} · ${esc(s.phone)}
      ${s.note ? `<div class="muted">${esc(s.note)}</div>` : ""}
    </div>
    <div class="party">
      <h2>Odběratel</h2>
      ${esc(inv.email || "—")}
    </div>
  </div>

  <table>
    <thead><tr><th>Položka</th><th class="num">Ks</th><th class="num">Cena/ks</th><th class="num">Celkem</th></tr></thead>
    <tbody>${itemRows(inv)}</tbody>
  </table>

  <table class="summary"><tbody>${summaryRows(inv, cfg)}</tbody></table>

  <div class="actions"><button class="btn" onclick="window.print()">Vytisknout / uložit PDF</button></div>
</body></html>`;
}
