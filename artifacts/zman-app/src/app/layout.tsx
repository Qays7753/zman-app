import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { BRAND_ASSETS } from "@/lib/brand-tokens";
import { COLOR_TOKENS } from "@/lib/tokens";
import { Toaster } from "sonner";
import QueryProvider from "@/providers/query-provider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const tajawal = localFont({
  src: [
    { path: "./fonts/tajawal-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/tajawal-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/tajawal-arabic-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-tajawal",
  display: "swap",
});

const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

const cormorant = localFont({
  src: [
    { path: "./fonts/cormorant-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zman Greens JO",
  description: "أداة Zman الداخلية لإدارة الطلبات والمالية",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zman Greens",
  },
  icons: {
    icon: [
      { url: BRAND_ASSETS.icon512, type: "image/png" },
    ],
    apple: BRAND_ASSETS.appleTouchIcon,
  },
};

export const viewport: Viewport = {
  themeColor: COLOR_TOKENS.BRAND,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${montserrat.variable} ${cormorant.variable}`}>
      <body className="antialiased bg-canvas text-ink font-sans">
        <QueryProvider>
          {children}
          <Toaster
            dir="rtl"
            position="top-center"
            theme="light"
            richColors
            closeButton
            toastOptions={{
              style: {
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                zIndex: 700,
              },
              classNames: {
                toast: "bg-paper text-ink border border-hairline-2",
                success: "bg-brand-soft text-brand-deep border-brand/20",
                error: "bg-alert-soft text-alert border-alert/20",
                warning: "bg-warn-soft text-warn-deep border-warn/20",
                info: "bg-info-soft text-info border-info/20",
              }
            }}
          />
        </QueryProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
