// minihra-protokol.ts – komunikace minihry s hlavní hrou (protokol verze 1)

type InitMessage = { type: "INIT"; version?: number; level?: number; payload?: unknown };
type ErrorCode = "MISSING_PAYLOAD" | "INVALID_PAYLOAD" | "INVALID_RESULT" | "INTERNAL";

// Volitelný seznam povolených domén hlavní hry (VITE_ALLOWED_PARENT_ORIGINS, oddělené čárkou).
const allowedOrigins: string[] = (import.meta.env.VITE_ALLOWED_PARENT_ORIGINS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const embedded = window.parent !== window; // běží v iframu hlavní hry?
let parentOrigin: string | null = null;
let started = false;
let finished = false;

function post(message: object) {
  if (!embedded) {
    console.info("[minihra] samostatný režim – zpráva se nikam neposílá:", message);
    return;
  }
  const targets = parentOrigin ? [parentOrigin] : allowedOrigins.length > 0 ? allowedOrigins : ["*"];
  targets.forEach((origin) => window.parent.postMessage({ version: 1, ...message }, origin));
}

/**
 * Spustí komunikaci. onInit dostane level a payload od hlavní hry.
 * Při samostatném otevření (vývoj) je vezme z adresy: ?level=2&payload={"rounds":3}
 */
export function startMinihra(onInit: (level: number | undefined, payload: unknown) => void) {
  if (started) return;
  started = true;

  if (!embedded) {
    const q = new URLSearchParams(window.location.search);
    const rawPayload = q.get("payload");
    let payload: unknown = undefined;
    if (rawPayload !== null) {
      try { payload = JSON.parse(rawPayload); } catch { payload = rawPayload; }
    }
    const rawLevel = q.get("level");
    const level = rawLevel !== null && rawLevel.trim() !== "" ? Number(rawLevel) : undefined;
    onInit(level !== undefined && Number.isFinite(level) ? level : undefined, payload);
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return; // jen zprávy od hlavní hry
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(event.origin)) return;
    const data = event.data as InitMessage;
    if (!data || data.type !== "INIT") return;
    if (event.origin !== "null") parentOrigin = event.origin;
    finished = false; // nový INIT = nové kolo od začátku
    const level = typeof data.level === "number" && Number.isFinite(data.level) ? data.level : undefined;
    onInit(level, data.payload);
  });
  post({ type: "READY" });
}

/** Ukončí minihru a pošle výsledek. successRate musí být 0–1. */
export function finish(successRate: number, payload?: unknown) {
  if (finished) return;
  if (typeof successRate !== "number" || !Number.isFinite(successRate)) {
    fail("INVALID_RESULT", `Neplatná úspěšnost: ${String(successRate)}`);
    return;
  }
  finished = true;
  const rate = Math.min(1, Math.max(0, successRate));
  post({ type: "FINISH", successRate: rate, succesRate: rate, payload });
}

/** Ohlásí, že minihra nemůže pokračovat. */
export function fail(code: ErrorCode, message: string) {
  finished = true;
  post({ type: "ERROR", code, message });
}
