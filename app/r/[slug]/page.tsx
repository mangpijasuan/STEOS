"use client";

import { use } from "react";
import Storefront from "./Storefront";

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <Storefront slug={slug} />;
}
