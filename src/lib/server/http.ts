import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE_NAMES, sessionCookieName, validateSession } from "./auth/session";
import { db, type Sql } from "./db";
import { extraAllowedOrigins } from "./env";
import { AppError } from "./errors";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(status: number, error: string, code?: string, headers: Record<string, string> = {}) {
  return json({ ok: false, error, code }, status, headers);
}

export function readSessionToken(req: NextRequest): string | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = req.cookies.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

export function clearSessionCookie(res: NextResponse) {
  for (const name of SESSION_COOKIE_NAMES) {
    res.cookies.set(name, "", { path: "/", expires: new Date(0), httpOnly: true, sameSite: "strict", secure: name.startsWith("__Host-") });
  }
  return res;
}

/**
 * CSRF defence for state-changing requests: the browser-supplied Origin must
 * match the host serving the API. Combined with SameSite=Strict cookies and
 * JSON-only bodies, cross-site forms and scripts cannot act as the player.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (extraAllowedOrigins().includes(originUrl.origin)) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return Boolean(host) && originUrl.host === host;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function checkMutationRequest(req: NextRequest): NextResponse | null {
  if (!MUTATING.has(req.method)) return null;
  if (!isSameOrigin(req)) return errorResponse(403, "Cross-origin request blocked", "BAD_ORIGIN");
  const type = req.headers.get("content-type") ?? "";
  if (req.method !== "DELETE" && !type.includes("application/json")) {
    return errorResponse(415, "Expected application/json", "BAD_CONTENT_TYPE");
  }
  return null;
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown = {};
  const text = await req.text();
  if (text) {
    if (text.length > 64_000) throw new AppError(413, "Request too large");
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError(400, "Malformed JSON", "BAD_JSON");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(400, `${issue.path.join(".") || "body"}: ${issue.message}`, "VALIDATION");
  }
  return parsed.data;
}

export interface AuthedContext {
  req: NextRequest;
  sql: Sql;
  playerId: string;
  sessionId: string;
  locked: boolean;
  now: Date;
  params: Record<string, string>;
}

type RouteParams = { params: Promise<Record<string, string>> };

/** Route ids are UUIDs; reject anything else before it reaches SQL. */
export function idParam(params: Record<string, string>, key = "id"): string {
  const parsed = z.uuid().safeParse(params[key]);
  if (!parsed.success) throw new AppError(404, "Not found", "NOT_FOUND");
  return parsed.data;
}

export function handleError(err: unknown) {
  if (err instanceof AppError) return errorResponse(err.status, err.message, err.code);
  console.error("[api] unhandled error", err);
  return errorResponse(500, "Something went wrong on the server", "INTERNAL");
}

/**
 * Wraps an API route so that it only runs for a valid, unlocked session.
 * Authentication is enforced here on the server for every call, independent
 * of anything the frontend or proxy does.
 */
export function authed(handler: (ctx: AuthedContext) => Promise<Response>, opts: { allowLocked?: boolean } = {}) {
  return async (req: NextRequest, route?: RouteParams) => {
    const blocked = checkMutationRequest(req);
    if (blocked) return blocked;
    try {
      const sql = db();
      const now = new Date();
      const check = await validateSession(sql, readSessionToken(req), now);
      if (check.status === "invalid") {
        return clearSessionCookie(errorResponse(401, "Please log in", "UNAUTHENTICATED"));
      }
      if (check.status === "locked" && !opts.allowLocked) {
        return errorResponse(423, "Session locked — enter your PIN", "LOCKED");
      }
      const params = route ? await route.params : {};
      return await handler({
        req,
        sql,
        playerId: check.playerId,
        sessionId: check.sessionId,
        locked: check.status === "locked",
        now,
        params,
      });
    } catch (err) {
      return handleError(err);
    }
  };
}

export { sessionCookieName };
