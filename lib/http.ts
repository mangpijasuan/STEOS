import { ZodError } from "zod";

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

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function handle(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(error.details === undefined ? { error: error.message } : { error: error.message, issues: error.details }, error.status);
      }
      if (error instanceof ZodError) return json({ error: "Invalid input", issues: error.issues }, 400);
      if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON" }, 400);
      console.error(error);
      return json({ error: "Server error" }, 500);
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
