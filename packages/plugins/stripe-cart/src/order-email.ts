/**
 * Order e-mail templates (edited in code).
 *
 * Self-contained on purpose: no imports from the plugin runtime, so you can
 * tweak the wording/markup here without touching `sandbox-entry.ts`. Two
 * messages are produced — one for the customer (order confirmation) and one
 * for the shop operator (new-order notification). Both return `{ subject,
 * text, html }` for the EmDash email pipeline (`ctx.email.send`).
 *
 * Sandbox-safe: plain string templating only, no Node built-ins.
 */

export interface OrderEmailItem {
	title: string;
	unitAmount: number; // minor units (e.g. 59000 = 590.00)
	quantity: number;
	productId?: string;
}

export interface OrderEmailData {
	id?: string;
	sessionId?: string;
	email?: string | null;
	currency: string;
	items: OrderEmailItem[];
	amountTotal?: number;
	status?: string;
	test?: boolean;
	createdAt?: string;
}

export interface RenderedEmail {
	subject: string;
	text: string;
	html: string;
}

/** Minor units (e.g. 59000) -> "590,00 Kč". */
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

/** Total: the recorded amount when present, otherwise summed from items. */
function total(order: OrderEmailData): number {
	if (typeof order.amountTotal === "number") return order.amountTotal;
	return (order.items ?? []).reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);
}

/** Escape the few characters that would break our minimal HTML. */
function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function itemsText(order: OrderEmailData): string {
	return (order.items ?? [])
		.map(
			(i) =>
				`  • ${i.title} — ${i.quantity}× ${money(i.unitAmount, order.currency)}` +
				` = ${money(i.unitAmount * i.quantity, order.currency)}`,
		)
		.join("\n");
}

function itemsRows(order: OrderEmailData): string {
	return (order.items ?? [])
		.map(
			(i) =>
				`<tr>` +
				`<td style="padding:6px 0;border-bottom:1px solid #eee;">${esc(i.title)}</td>` +
				`<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center;">${i.quantity}×</td>` +
				`<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">` +
				`${esc(money(i.unitAmount * i.quantity, order.currency))}</td>` +
				`</tr>`,
		)
		.join("");
}

/** Shared HTML shell so both e-mails look the same. */
function htmlShell(heading: string, intro: string, order: OrderEmailData, extraRows = ""): string {
	return `<!doctype html>
<html lang="cs"><body style="margin:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;">${esc(heading)}</h1>
      <p style="margin:0 0 16px;color:#555;">${esc(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>${itemsRows(order)}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:10px 0 0;font-weight:bold;">Celkem</td>
            <td style="padding:10px 0 0;text-align:right;font-weight:bold;white-space:nowrap;">
              ${esc(money(total(order), order.currency))}</td>
          </tr>
        </tfoot>
      </table>
      ${extraRows}
    </div>
    <p style="color:#999;font-size:12px;text-align:center;margin:16px 0 0;">
      ${order.test ? "Testovací objednávka — platba přes Stripe byla přeskočena." : "Děkujeme, že nakupujete u nás."}
    </p>
  </div>
</body></html>`;
}

/** Order confirmation sent to the customer. */
export function renderCustomerOrderEmail(order: OrderEmailData): RenderedEmail {
	const subject = `Potvrzení objednávky${order.test ? " (test)" : ""}`;
	const intro = "Děkujeme za vaši objednávku! Níže najdete její shrnutí.";

	const text =
		`${intro}\n\n` +
		`${itemsText(order)}\n\n` +
		`Celkem: ${money(total(order), order.currency)}\n` +
		(order.id ? `\nČíslo objednávky: ${order.id}\n` : "") +
		`\nO odeslání vás budeme informovat.`;

	return { subject, text, html: htmlShell("Potvrzení objednávky", intro, order) };
}

/** New-order notification sent to the shop operator (admin). */
export function renderAdminOrderEmail(order: OrderEmailData): RenderedEmail {
	const subject = `Nová objednávka${order.test ? " (test)" : ""} — ${money(total(order), order.currency)}`;
	const intro = `Přišla nová objednávka od ${order.email || "neznámého zákazníka"}.`;

	const meta =
		`\n\nZákazník: ${order.email || "—"}\n` +
		`Stav: ${order.status || "—"}\n` +
		(order.id ? `Objednávka: ${order.id}\n` : "") +
		(order.sessionId ? `Stripe session: ${order.sessionId}\n` : "");

	const text = `${intro}\n\n${itemsText(order)}\n\nCelkem: ${money(total(order), order.currency)}${meta}`;

	const extraRows =
		`<p style="margin:16px 0 0;font-size:13px;color:#555;">` +
		`Zákazník: <strong>${esc(order.email || "—")}</strong><br>` +
		`Stav: ${esc(order.status || "—")}` +
		(order.id ? `<br>Objednávka: ${esc(order.id)}` : "") +
		(order.sessionId ? `<br>Stripe session: ${esc(order.sessionId)}` : "") +
		`</p>`;

	return { subject, text, html: htmlShell("Nová objednávka", intro, order, extraRows) };
}
