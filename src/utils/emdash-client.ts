/**
 * Server-side klient pro vestavěné EmDash REST API (`/_emdash/api`).
 *
 * Schovává autentizaci, hlavičky a zpracování odpovědí do generických metod.
 * POUZE pro serverové použití (Astro endpointy nebo `.astro` frontmatter) --
 * používá tajný `API_KEY`, takže ho nikdy nevolej přímo z prohlížeče.
 */

/** Úspěšná odpověď REST API. */
interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
}

/** Volitelné nastavení při vytváření klienta. */
export interface EmDashClientOptions {
	/** Plná base URL k API, např. "https://example.com/_emdash/api". */
	baseUrl?: string;
	/** API klíč (Bearer token). Výchozí se bere z `API_KEY` v prostředí. */
	apiKey?: string;
}

export class EmDashClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(options: EmDashClientOptions = {}) {
		const siteUrl =
			import.meta.env.EMDASH_SITE_URL ?? process.env.EMDASH_SITE_URL ?? "http://localhost:4321";

		this.baseUrl = (options.baseUrl ?? `${siteUrl.replace(/\/$/, "")}/_emdash/api`).replace(
			/\/$/,
			"",
		);
		this.apiKey = options.apiKey ?? import.meta.env.API_KEY ?? process.env.API_KEY ?? "";

		if (!this.apiKey) {
			console.warn("EmDashClient: API_KEY nebyl nalezen v proměnných prostředí.");
		}
	}

	/**
	 * Jádro klienta -- sestaví hlavičky, zavolá `fetch`, ověří odpověď
	 * a vrátí už jen `data`. Při chybě vyhodí `Error` s čitelnou zprávou.
	 */
	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const headers = new Headers(options.headers);
		headers.set("Authorization", `Bearer ${this.apiKey}`);
		if (!(options.body instanceof FormData)) {
			headers.set("Content-Type", "application/json");
		}

		const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

		let result: ApiResponse<T>;
		try {
			result = (await response.json()) as ApiResponse<T>;
		} catch {
			throw new Error(`EmDash API: neplatná odpověď (status ${response.status}).`);
		}

		if (!response.ok || !result.success) {
			throw new Error(
				result.error?.message ?? `EmDash API: požadavek selhal (status ${response.status}).`,
			);
		}

		return result.data as T;
	}

	/** GET na libovolnou cestu pod `/_emdash/api`. `params` se serializují do query stringu. */
	get<T = unknown>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
		const query = params
			? "?" +
				new URLSearchParams(
					Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
				).toString()
			: "";
		return this.request<T>(`${path}${query}`, { method: "GET" });
	}

	/** POST na libovolnou cestu. `body` se serializuje do JSON (pokud není `FormData`). */
	post<T = unknown>(path: string, body?: unknown): Promise<T> {
		return this.request<T>(path, {
			method: "POST",
			body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
		});
	}

	/** PUT na libovolnou cestu. `body` se serializuje do JSON. */
	put<T = unknown>(path: string, body?: unknown): Promise<T> {
		return this.request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
	}

	/** PATCH na libovolnou cestu. `body` se serializuje do JSON. */
	patch<T = unknown>(path: string, body?: unknown): Promise<T> {
		return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
	}

	/** DELETE na libovolnou cestu. */
	delete<T = unknown>(path: string): Promise<T> {
		return this.request<T>(path, { method: "DELETE" });
	}
}
