import { HttpError, handle, idParam } from "@/lib/http";
import { loadPublicImage } from "@/lib/images";

// Public: the storefront shows menu photos to people who are not signed in.
// A photo never changes once saved (a new upload gets a new id), so it can be cached for a year.
export const GET = handle(async (req, ctx) => {
  const id = await idParam(ctx);
  const etag = `"${id}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const image = await loadPublicImage(id);
  if (!image) throw new HttpError(404, "Not found");
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      // The file is shown in an <img> only; stop browsers from ever treating it as a page or script.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
