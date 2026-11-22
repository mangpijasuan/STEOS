import crypto from "node:crypto";
import { ZodError } from "zod";
import { alert } from "./alerts";
import { log, safePath } from "./log";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: any) => Promise<Response>;

/**
 * Wraps a route handler so thrown errors become clean JSON responses. Unexpected errors are logged
 * with a request id, which the response also carries so a user can quote it, and raise an alert.
 */
export function handle(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      const route = `${req.method} ${safePath(new URL(req.url).pathname)}`;
      if (error instanceof HttpError) {
        if (error.status >= 500) log.warn("http.error_response", { route, status: error.status, message: error.message });
        return json(error.details === undefined ? { error: error.message } : { error: error.message, issues: error.details }, error.status);
      }
      if (error instanceof ZodError) return json({ error: "Invalid input", issues: error.issues }, 400);
      if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON" }, 400);
      const requestId = crypto.randomUUID();
      await alert(`server-error:${route}`, `Unexpected error on ${route}`, { requestId, error });
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
