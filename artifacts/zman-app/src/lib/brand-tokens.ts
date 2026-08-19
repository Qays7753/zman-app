export const BRAND_TOKENS = {
  forest: "#2E7D32",
  forestDeep: "#1B5E20",
  succulent: "#4CAF50",
  leaf: "#81C784",
  gold: "#FBC02D",
  goldDeep: "#F9A825",
  cream: "#FAFAF5",
  warm: "#F5F0E8",
  white: "#FFFFFF",
  dark: "#1A2E1A",
  textSecondary: "#3D5A35",
  textMuted: "#7A9B6F",
  border: "#E4EDD8",
  softGreen: "#E8F5E9",
  semantic: {
    success: "#2E7D32",
    successSoft: "#E8F5E9",
    warning: "#F9A825",
    warningSoft: "#FFF8E1",
    danger: "#C0392B",
    dangerSoft: "#FBE9E6",
    info: "#1565C0",
    infoSoft: "#E8F0F8",
  },
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
