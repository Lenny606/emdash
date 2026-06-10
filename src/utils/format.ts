/** Shared formatting helpers for the Czech-language site. */

const DATE_FORMATTER = new Intl.DateTimeFormat("cs-CZ", {
	year: "numeric",
	month: "long",
	day: "numeric",
});

/** Format a date as a Czech long date, e.g. "10. června 2026". */
export function formatDate(date: Date): string {
	return DATE_FORMATTER.format(date);
}

/**
 * Pick the correct Czech plural form for a count.
 * 1 -> one, 2-4 -> few, everything else -> many.
 */
export function plural(n: number, one: string, few: string, many: string): string {
	if (n === 1) return one;
	if (n >= 2 && n <= 4) return few;
	return many;
}
