"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems, mainNavItems, moreNavItems } from "@/config/nav";
import { InstallButton } from "@/components/pwa/InstallButton";
import { cn } from "@/lib/utils";
import { useAppShell } from "@/providers/app-shell-context";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function AppShell({ children, title: propTitle, action: propAction }: AppShellProps) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  let context: ReturnType<typeof useAppShell> | null = null;
  try {
    context = useAppShell();
  } catch {
    // خارج Provider (مثل صفحات الخطأ أو الدخول)
  }

  const title = propTitle !== undefined ? propTitle : context ? context.title : "Zman";
  const action = propAction !== undefined ? propAction : context ? context.action : null;


  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // هل أحد عناصر "المزيد" هو الصفحة الحالية؟
  const isMoreActive = moreNavItems.some(
    (item) =>
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href)),
  );

  return (
    <div className="h-dvh flex flex-col bg-canvas text-ink font-sans overflow-hidden">
      {/* شريط تنبيه انقطاع الشبكة */}
      {!isOnline && (
        <div className="flex-shrink-0 w-full h-8 bg-warn-soft text-warn-deep text-xs font-semibold flex items-center justify-center gap-2 z-sticky border-b border-warn/10 select-none">
          <span>لا يوجد اتصال بالإنترنت</span>
        </div>
      )}

      {/* الشريط الجانبي للديسكتوب */}
      <aside className="hidden lg:flex fixed top-0 inset-e-0 h-screen w-[240px] flex-col bg-paper border-s border-hairline z-sticky">
        <div className="h-16 flex items-center px-6 border-b border-hairline">
          <span className="text-xl font-bold text-info">Zman</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-info-soft text-info font-bold"
                    : "text-ink-2 hover:bg-canvas hover:text-ink",
                )}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {/* زر تثبيت التطبيق — ديسكتوب */}
        <div className="px-3 pb-4">
          <InstallButton />
        </div>
      </aside>

      {/* هيدر الموبايل — ارتفاع ثابت 56px */}
      <header className="lg:hidden flex-shrink-0 w-full h-14 bg-paper/90 backdrop-blur-sm shadow-sm border-b border-hairline flex items-center justify-between px-4 z-sticky">
        <h1 className="text-base font-bold text-ink truncate">{title || "Zman"}</h1>
        {action && <div className="flex items-center ms-3">{action}</div>}
      </header>

      {/* المنطقة الرئيسية */}
      <main className="flex-1 overflow-hidden flex flex-col lg:pe-[240px]">
        {/* شريط الأدوات للديسكتوب — ارتفاع ثابت 64px */}
        <div className="hidden lg:flex flex-shrink-0 items-center justify-between px-8 h-16 border-b border-hairline bg-paper">
          <h2 className="text-lg font-bold text-ink">{title || "الرئيسية"}</h2>
          {action && <div>{action}</div>}
        </div>

        {/* منطقة المحتوى القابلة للتمرير — تملأ المساحة المتبقية */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <div className="w-full max-w-6xl mx-auto px-4 lg:px-8 py-4 lg:py-6 flex flex-col min-h-full min-w-0">
            {children}
          </div>
        </div>
      </main>

      {/* شريط التبويب السفلي للموبايل — 4 تبويبات + زر المزيد */}
      <nav className="lg:hidden flex-shrink-0 h-16 bg-paper border-t border-hairline flex items-center justify-around z-sticky">
        {mainNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-full h-full text-[11px] transition-colors border-t-2 border-transparent",
                isActive
                  ? "text-info font-bold border-info"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {/* زر المزيد */}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 w-full h-full text-[11px] transition-colors border-t-2 border-transparent",
            isMoreActive
              ? "text-info font-bold border-info"
              : "text-ink-3 hover:text-ink-2",
          )}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>المزيد</span>
        </button>
      </nav>

      {/* شيت "المزيد" */}
      {isMoreOpen && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-sheet bg-ink/40 lg:hidden"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          {/* اللوحة */}
          <div className="fixed inset-x-0 bottom-0 z-sheet bg-paper rounded-t-2xl shadow-xl border-t border-hairline lg:hidden">
            {/* المقبض */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 bg-ink/20 rounded-full" />
            </div>
            {/* الترويسة */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
              <h3 className="text-base font-bold text-ink">المزيد</h3>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-canvas text-ink-3 transition-colors -me-2"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* الروابط */}
            <div className="py-2">
              {moreNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-5 min-h-[48px] text-sm transition-colors",
                      isActive
                        ? "text-info font-bold bg-info-soft"
                        : "text-ink-2 hover:bg-canvas hover:text-ink",
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            {/* زر التثبيت — موبايل */}
            <div className="px-5 py-4 border-t border-hairline">
              <InstallButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
