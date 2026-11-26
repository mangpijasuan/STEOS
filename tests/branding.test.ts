import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { branding, copyrightYear, feeLabel, footerLines, legalName, metaDescription, pageTitle, signInSubject } from "../lib/branding";

const root = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" ? [] : sourceFiles(rel);
    return /\.(ts|tsx|mjs)$/.test(e.name) ? [rel] : [];
  });
}
// Comments may name the product; strings and JSX text may not.
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the platform's identity", () => {
  it("is the approved configuration", () => {
    expect(branding.name).toBe("STEOS");
    expect(branding.fullName).toBe("Siamsil Technologies Enterprise Operating System");
    expect(branding.company).toBe("Siamsil Technologies");
    expect(branding.tagline).toBe("One Platform. Every Business.");
    expect(branding.domain).toBeNull();
    expect(branding.logo).toEqual({ light: null, dark: null });
    expect(branding.colors).toEqual({ primary: "#183153", secondary: "#D4AF37", white: "#FFFFFF" });
    expect(branding.poweredBy).toEqual({ enabled: false, text: "Powered by STEOS" });
  });

  it("builds titles, labels, subjects and footers from it", () => {
    expect(pageTitle("Kitchen")).toBe("Kitchen · STEOS");
    expect(feeLabel).toBe("STEOS fee");
    expect(signInSubject).toBe("Sign in to STEOS");
    expect(metaDescription).toBe("STEOS by Siamsil Technologies: One Platform. Every Business.");
    expect(copyrightYear).toBe(2026);
    expect(legalName).toBe("Siamsil Technologies");
    expect(footerLines).toEqual(["© 2026 Siamsil Technologies All rights reserved.", "STEOS is a product of Siamsil Technologies."]);
  });

  it("is not applied to a restaurant's storefront, which keeps its own brand", () => {
    const storefront = fs.readFileSync(path.join(root, "app/r/[slug]/Storefront.tsx"), "utf8");
    expect(storefront).not.toMatch(/lib\/branding/);
    expect(branding.poweredBy.enabled).toBe(false);
  });
});

describe("nothing hard-codes the platform name", () => {
  const files = [...sourceFiles("app"), ...sourceFiles("lib"), ...sourceFiles("scripts")].filter((f) => f !== path.join("lib", "branding.ts"));

  it("no screen, library or script file names the product in a string or in page text", () => {
    const offenders = files.filter((f) => /\bSTEOS\b/.test(withoutComments(fs.readFileSync(path.join(root, f), "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("no file in app, lib or scripts uses the old name SROS, other than the two kept storage keys and one internal field", () => {
    const offenders = files.flatMap((f) => {
      const code = fs.readFileSync(path.join(root, f), "utf8").replace(/sros:(customer|side)/g, "").replace(/srosRevenueCents/g, "");
      return /sros/i.test(code) ? [f] : [];
    });
    expect(offenders).toEqual([]);
  });
});
