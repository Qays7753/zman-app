import { BarChart3, ClipboardList, Home, MessageSquare, Wallet, Landmark, Settings, Boxes, Clock, Package, Building2 } from "lucide-react";

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
    label: "الحسابات",
    href: "/finance?tab=accounts",
    icon: Landmark,
  },
  {
    label: "الافتتاحي",
    href: "/finance?tab=opening",
    icon: Settings,
  },
  {
    label: "إدارة أصناف المشتريات",
    href: "/finance?manageCatalog=purchases",
    icon: Boxes,
  },
  {
    label: "إدارة فئات المصاريف",
    href: "/finance?manageCatalog=expenses",
    icon: Boxes,
  },
];
