import { BarChart3, ClipboardList, Home, MessageSquare, Wallet, Settings, Boxes, Clock, Package, Building2, ShieldCheck, Landmark } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** كل عناصر التنقل — تُستخدم في الشريط الجانبي (الديسكتوب) */
export const navItems: NavItem[] = [
  {
    label: "الرئيسية",
    href: "/",
    icon: Home,
  },
  {
    label: "الطلبات",
    href: "/orders",
    icon: ClipboardList,
  },
  {
    label: "المالية",
    href: "/finance",
    icon: Wallet,
  },
  {
    label: "المخزون",
    href: "/inventory",
    icon: Package,
  },
  {
    label: "الملاحظات",
    href: "/snippets",
    icon: MessageSquare,
  },
  {
    label: "التقارير",
    href: "/reports",
    icon: BarChart3,
  },
];

/** التبويبات الأساسية للشريط السفلي في الموبايل (4 عناصر) */
export const mainNavItems: NavItem[] = [
  navItems[0], // الرئيسية
  navItems[1], // الطلبات
  navItems[2], // المالية
  navItems[3], // المخزون
];

/** العناصر الإضافية التي تظهر في sheet "المزيد" */
export const moreNavItems: NavItem[] = [
  navItems[5], // التقارير
  navItems[4], // الملاحظات
  {
    label: "الأصول الرأسمالية",
    href: "/assets",
    icon: Building2,
  },
  {
    label: "كل الحركات المالية",
    href: "/activities",
    icon: Clock,
  },
  {
    label: "الافتتاحي",
    href: "/settings/opening-balance",
    icon: Settings,
  },
  // Round 6 — «الحسابات والصناديق» نُقل من تبويبات /finance الظاهرة إلى قائمة «المزيد».
  // يُعيد الطريق /finance/accounts التوجيه إلى /finance?tab=accounts تلقائياً (انظر app/(app)/finance/accounts/page.tsx).
  {
    label: "الحسابات والصناديق",
    href: "/finance/accounts",
    icon: Landmark,
  },
  {
    label: "إدارة أصناف المشتريات",
    href: "/finance?manageCatalog=purchases",
    icon: Boxes,
  },
  // Issue #7 — «إدارة فئات المصاريف» نُقِل من هنا إلى زرّ مرئيّ في رأس تبويب
  // المصاريف داخل ExpensesTab.tsx (يفتح FinanceCatalogModal عبر ?manageCatalog=expenses).
  // Issue #16 — سجل التدقيق: صفحة /settings/audit-log تعرض كل عمليات
  // create/update/delete المالية. يستخدم ShieldCheck للأيقونة.
  {
    label: "سجل التدقيق",
    href: "/settings/audit-log",
    icon: ShieldCheck,
  },
];
