import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { alert } from "./alerts";
import { safePath } from "./log";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** An operational failure whose public message can be shared with staff. */
export class OperationalError extends HttpError {
  constructor(public key: string, message: string) {
    super(502, message);
  }
}

/**
 * The JSON body of a request, or `{}` when nothing was sent. A browser's POST with no body still carries an empty
 * stream, so checking `req.body` is not enough: reading it as JSON fails. A body that is present but not valid JSON is
 * still refused (as a 400, by `handle`).
 */
export async function optionalJson(req: Request): Promise<unknown> {
  const text = await req.text();
  return text.trim() === "" ? {} : JSON.parse(text);
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: any) => Promise<Response>;

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function handle(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof OperationalError) {
        await alert(error.key, error.message, { path: safePath(new URL(req.url).pathname) });
      }
      if (error instanceof HttpError) {
        return json(error.details === undefined ? { error: error.message } : { error: error.message, issues: error.details }, error.status);
      }
      if (error instanceof ZodError) return json({ error: "Invalid input", issues: error.issues }, 400);
      if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON" }, 400);
      const requestId = randomUUID();
      const path = safePath(new URL(req.url).pathname);
      await alert(`unexpected-route-error:${req.method}:${path}`, "An unexpected server error occurred", {
        requestId, method: req.method, path, error,
      });
      return json({ error: "Server error", requestId }, 500);
    }
  };
}

/** Reads the dynamic id segment of a route and checks it is a UUID. */
export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "Invalid id");
  }
  return id;
}
