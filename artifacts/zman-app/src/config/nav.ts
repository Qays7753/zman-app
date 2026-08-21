import {
  BarChart3,
  ClipboardList,
  Home,
  MessageSquare,
  Wallet,
  Settings,
  Boxes,
  Clock,
  Package,
  Building2,
  ShieldCheck,
  Landmark,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

export interface MoreNavGroup {
  label: string;
  description?: string;
  items: NavItem[];
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

const moreNavGroups: MoreNavGroup[] = [
  {
    label: "المتابعة والتحليل",
    description: "وجهات تساعدك في متابعة العمل وقراءة النتائج",
    items: [
      { ...navItems[5], description: "قراءة المؤشرات والنتائج" }, // التقارير
      { ...navItems[4], description: "حفظ ملاحظات الورشة" }, // الملاحظات
      {
        label: "الأصول الرأسمالية",
        href: "/assets",
        icon: Building2,
        description: "متابعة الأصول والإهلاك",
      },
      {
        label: "سجل النشاط",
        href: "/activities",
        icon: Clock,
        description: "تصفح الحركات بترتيبها الزمني",
      },
    ],
  },
  {
    label: "الإدارة المالية",
    description: "ضبط الأساس المالي والحسابات",
    items: [
      {
        label: "الأرصدة الافتتاحية",
        href: "/settings/opening-balance",
        icon: Settings,
        description: "تثبيت الأرصدة الأساسية للمشروع",
      },
      {
        label: "الحسابات والصناديق",
        href: "/finance/accounts",
        icon: Landmark,
        description: "إدارة الصناديق والحسابات البنكية",
      },
      {
        label: "أصناف الشراء",
        href: "/finance?manageCatalog=purchases",
        icon: Boxes,
        description: "تنظيم الأصناف المستخدمة في الشراء",
      },
    ],
  },
  {
    label: "المراجعة والأمان",
    description: "تتبع التغييرات والعمليات الحساسة",
    items: [
      {
        label: "سجل التدقيق",
        href: "/settings/audit-log",
        icon: ShieldCheck,
        description: "تتبع التغييرات والعمليات الحساسة",
      },
    ],
  },
];

/** العناصر الإضافية المسطحة للتوافق مع فحص الحالة النشطة */
export const moreNavItems: NavItem[] = moreNavGroups.flatMap((group) => group.items);

/** العناصر الإضافية مجمعة لعرض More على الهاتف */
export { moreNavGroups };
