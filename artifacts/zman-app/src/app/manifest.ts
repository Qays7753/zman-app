import type { MetadataRoute } from "next";
import { BRAND_ASSETS } from "@/lib/brand-tokens";
import { COLOR_TOKENS } from "@/lib/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zman Greens JO",
    short_name: "Zman",
    description: "أداة Zman الداخلية لإدارة الطلبات والمالية",
    start_url: "/",
    display: "standalone",
    background_color: COLOR_TOKENS.CANVAS,
    theme_color: COLOR_TOKENS.BRAND,
    icons: [
      {
        src: BRAND_ASSETS.icon192,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: BRAND_ASSETS.icon512,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: BRAND_ASSETS.iconMaskable192,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: BRAND_ASSETS.iconMaskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
