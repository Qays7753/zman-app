/**
 * Zman brand tokens.
 *
 * The semantic contract lives in docs/DESIGN_SYSTEM_V2_1_CONTRACT.md.
 * Keep legacy aliases below until every consumer migrates to a semantic role.
 */
export const BRAND_TOKENS = {
  // Core brand values
  forest: "#2E7D32",
  forestDeep: "#1B5E20",
  forestHover: "#276B2B",
  forestPressed: "#215C24",
  succulent: "#4CAF50",
  leaf: "#81C784",

  // Surfaces
  cream: "#FAFAF5",
  white: "#FFFFFF",
  warm: "#F5F0E8",
  analytic: "#EEF2F5",
  softGreen: "#E8F5E9",
  softInfo: "#E8F0F8",
  softDanger: "#FBE9E6",
  softWarning: "#FFF8E1",

  // Typography
  dark: "#1A2E1A",
  textSecondary: "#3D5A35",
  textMuted: "#5A7850",
  placeholder: "#5A7850",

  // Structural colors
  border: "#E4EDD8",
  borderField: "#7F9372",
  borderStrong: "#51606F",

  // Accents and semantics
  gold: "#FBC02D",
  goldDeep: "#8A5B00",
  alert: "#C0392B",
  alertDeep: "#8B2718",
  info: "#1565C0",
  analyticNeutral: "#51606F",

  semantic: {
    success: "#1B5E20",
    successSoft: "#E8F5E9",
    warning: "#8A5B00",
    warningAccent: "#FBC02D",
    warningSoft: "#FFF8E1",
    danger: "#8B2718",
    dangerStrong: "#C0392B",
    dangerSoft: "#FBE9E6",
    info: "#1565C0",
    infoSoft: "#E8F0F8",
    analytic: "#51606F",
  },

  // External service brand: WhatsApp button only.
  whatsapp: "#25D366",
} as const;

export const BRAND_ASSETS = {
  rosette: "/brand/zman-rosette-primary.svg",
  headerLogo: "/brand/zman-logo-header.png",
  wordmark: "/brand/zman-logo-with-name.svg",
  icon192: "/brand/icon-192.png",
  icon512: "/brand/icon-512.png",
  iconMaskable192: "/brand/icon-192-maskable.png",
  iconMaskable512: "/brand/icon-512-maskable.png",
  appleTouchIcon: "/brand/apple-touch-icon.png",
} as const;

export const BRAND_FONT_FAMILIES = {
  arabic: "var(--font-tajawal), system-ui, sans-serif",
  latin: "var(--font-montserrat), system-ui, sans-serif",
  display: "var(--font-cormorant), Georgia, serif",
} as const;
