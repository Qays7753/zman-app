/**
 * Zman Design System Contract v2.1
 *
 * This file is the typed source of truth for semantic design roles.
 * It intentionally does not own product behavior, database rules, or
 * order/finance transitions. Those remain in their domain modules.
 */

export const ZMAN_DESIGN_SYSTEM_VERSION = "2.1" as const;

export const ZMAN_MOBILE_REFERENCE = {
  primaryDevice: "Samsung Galaxy S25",
  viewports: [
    { width: 320, height: 780, label: "small-phone" },
    { width: 360, height: 780, label: "s25-reference" },
    { width: 390, height: 844, label: "standard-phone" },
    { width: 430, height: 932, label: "large-phone" },
  ],
  textScales: [1, 1.3, 2],
  minimumTouchTargetPx: 48,
} as const;

export const DESIGN_SYSTEM_STATUS = {
  designFoundation: "approved-for-staged-implementation",
  actionDock: "frozen-until-state-machine-audit",
  charts: "frozen-until-background-pattern-audit",
  enlargedTextNavigation: "frozen-until-reflow-audit",
  offlineBehavior: "frozen-until-platform-finance-review",
  printing: "separate-scope",
  darkMode: "future-mode-values-defined-later",
} as const;

export const DESIGN_TOKENS = {
  surface: {
    canvas: "#FAFAF5",
    card: "#FFFFFF",
    warm: "#F5F0E8",
    analytic: "#EEF2F5",
    success: "#E8F5E9",
    warning: "#FFF8E1",
    danger: "#FBE9E6",
    info: "#E8F0F8",
  },
  text: {
    primary: "#1A2E1A",
    secondary: "#3D5A35",
    tertiary: "#5A7850",
    onAction: "#FFFFFF",
  },
  action: {
    primaryBg: "#2E7D32",
    primaryHover: "#276B2B",
    primaryPressed: "#215C24",
    primaryText: "#1B5E20",
    secondaryBorder: "#2E7D32",
  },
  semantic: {
    successText: "#1B5E20",
    warningText: "#8A5B00",
    dangerText: "#8B2718",
    infoText: "#1565C0",
    analytic: "#51606F",
    goldAccent: "#FBC02D",
  },
  external: {
    whatsapp: "#25D366",
  },
  geometry: {
    space1: "4px",
    space2: "8px",
    space3: "12px",
    space4: "16px",
    space5: "24px",
    space6: "32px",
    space8: "48px",
    space10: "64px",
    radiusSm: "8px",
    radiusMd: "12px",
    radiusLg: "16px",
    touchMin: "48px",
  },
  zIndex: {
    base: 0,
    sticky: 100,
    fab: 200,
    navbar: 300,
    actionbar: 400,
    overlay: 500,
    sheet: 600,
    toast: 700,
  },
  motion: {
    instant: "120ms cubic-bezier(.2,0,.38,.9)",
    quick: "180ms cubic-bezier(.2,0,.38,.9)",
    sheet: "240ms cubic-bezier(.05,.7,.1,1)",
    exit: "160ms cubic-bezier(.3,0,1,1)",
  },
} as const;

export const DESIGN_SYSTEM_GUARDS = {
  maxFilledBrandActionsPerViewport: 1,
  maxDefaultColoredChartSeries: 2,
  noColorOnlyStatus: true,
  fabRequiresConditionalContentPadding: true,
  actionDockRequiresStateMachineEvidence: true,
  rawHexInComponents: "forbidden",
  rawTailwindColorClassesInComponents: "forbidden",
} as const;

export type DesignSurface = keyof typeof DESIGN_TOKENS.surface;
export type DesignTextRole = keyof typeof DESIGN_TOKENS.text;
export type DesignActionRole = keyof typeof DESIGN_TOKENS.action;
export type DesignSemanticRole = keyof typeof DESIGN_TOKENS.semantic;
