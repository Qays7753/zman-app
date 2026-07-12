import { BarChart3, BookOpen, ClipboardList, Home, MessageSquare, Wallet, Landmark, Settings, Boxes, Clock } from "lucide-react";

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
  navItems[4], // التقارير
];

/** العناصر الإضافية التي تظهر في sheet "المزيد" */
export const moreNavItems: NavItem[] = [
  navItems[3], // الملاحظات
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
