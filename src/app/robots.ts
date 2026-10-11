import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Private and transactional areas are disallowed now so they stay out of search
// results when those phases ship.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/api/", "/search"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
