import type { MetadataRoute } from "next";

// Read on every request, not at build time, so one image serves both staging and production and the setting comes from
// the environment. Staging sets ROBOTS_NOINDEX=true so search engines do not list a test site; production leaves it unset.
// robots.txt only asks well-behaved crawlers to stay away. It is not access control: staging should also sit behind a
// login or an allow-list at the proxy (see docs/DEPLOYMENT.md).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (process.env.ROBOTS_NOINDEX === "true") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" } };
}
