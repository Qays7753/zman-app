"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems, mainNavItems, moreNavItems, moreNavGroups } from "@/config/nav";
import { InstallButton } from "@/components/pwa/InstallButton";
import { cn } from "@/lib/utils";
import { useAppShell } from "@/providers/app-shell-context";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { BackupModal } from "@/components/shared/BackupModal";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function AppShell({ children, title: propTitle, action: propAction }: AppShellProps) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // سحب للتحديث
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (container.scrollTop === 0) {
      setPullStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStart === null || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - pullStart;
    if (diff > 0) {
      const progress = Math.min(diff / 3, 80);
      setPullProgress(progress);
      if (progress > 10) {
        if (e.cancelable) e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullProgress >= 60) {
      setIsRefreshing(true);
      setPullProgress(40);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } else {
      setPullStart(null);
      setPullProgress(0);
    }
  };

  let context: ReturnType<typeof useAppShell> | null = null;
  try {
    context = useAppShell();
  } catch {
    // خارج Provider
    console.warn("AppShellContext used outside Provider");
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

  // ارتفاع القشرة من window.innerHeight بدل h-dvh:
  // في التطبيق المثبّت (standalone) على iOS/Android يُرجع dvh ارتفاعاً أكبر قليلاً من
  // المساحة المرئية، فيُدفَع شريط التبويب السفلي تحت الحافة ويبقى مخفياً عند التنقل.
  // window.innerHeight يعطي الارتفاع المرئي الحقيقي؛ نُحدّثه عند الدوران/تغيّر الحجم/العودة للتطبيق.
  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty(
        "--app-height",
        `${window.innerHeight}px`,
      );
    };
    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", setAppHeight);
    window.addEventListener("pageshow", setAppHeight);
    window.visualViewport?.addEventListener("resize", setAppHeight);
    return () => {
      window.removeEventListener("resize", setAppHeight);
      window.removeEventListener("orientationchange", setAppHeight);
      window.removeEventListener("pageshow", setAppHeight);
      window.visualViewport?.removeEventListener("resize", setAppHeight);
    };
  }, []);

  const isMoreActive = moreNavItems.some(
    (item) =>
      !item.href.includes("?") &&
      (pathname === item.href ||
        (item.href !== "/" && pathname.startsWith(item.href))),
  );

  return (
    <div className="h-[var(--app-height)] flex flex-col bg-canvas text-ink font-sans overflow-hidden">
      {/* شريط تنبيه انقطاع الشبكة */}
      {!isOnline && (
        <div className="flex-shrink-0 w-full h-8 bg-warn-soft text-warn-deep text-xs font-semibold flex items-center justify-center gap-2 z-sticky border-b border-warn/10 select-none">
          <span>لا يوجد اتصال بالإنترنت — التعديلات لن تُحفظ حتى تعود الشبكة</span>
        </div>
      )}

      {/* الشريط الجانبي للديسكتوب */}
      <aside className="hidden lg:flex fixed top-0 inset-e-0 h-screen w-[240px] flex-col bg-paper border-s border-hairline z-sticky">
        <div className="h-16 flex items-center px-6 border-b border-hairline">
          <span className="text-xl font-display font-semibold tracking-wide text-brand-deep">Zman</span>
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
                      ? "bg-brand-soft text-brand font-bold"
                      : "text-ink-2 hover:bg-canvas hover:text-ink",
                  )}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4">
          <InstallButton />
        </div>
      </aside>

      {/* هيدر الموبايل */}
      <header className="lg:hidden flex-shrink-0 w-full h-[58px] bg-paper/95 backdrop-blur-sm shadow-sm border-b border-hairline flex items-center justify-between gap-2 px-3 z-sticky">
        {title ? (
          <h1 className="min-w-0 max-w-[38%] shrink-0 text-base font-bold text-ink truncate">{title}</h1>
        ) : null}
        {action && (
          <div className={cn("flex items-center min-w-0 overflow-x-auto no-scrollbar", !title ? "flex-1 w-full" : "ms-3 flex-1 justify-end")}>
            {action}
          </div>
        )}
      </header>

      {/* المنطقة الرئيسية */}
      <main className="flex-1 overflow-hidden flex flex-col lg:pe-[240px]">
        {/* شريط الأدوات للديسكتوب */}
        <div className="hidden lg:flex flex-shrink-0 h-16 border-b border-hairline bg-paper">
          <div className="w-full max-w-6xl mx-auto px-8 flex items-center justify-between">
            {title ? (
              <h2 className="text-lg font-bold text-ink">{title}</h2>
            ) : (
              <span />
            )}
            {action && (
              <div className={cn("flex items-center min-w-0", !title ? "flex-1 w-full" : "ms-3 flex-1 justify-end")}>
                {action}
              </div>
            )}
          </div>
        </div>

        {/* منطقة المحتوى القابلة للتمرير مع دعم السحب للتحديث */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative"
        >
          {pullProgress > 0 && (
            <div
              style={{ height: `${pullProgress}px` }}
              className="w-full flex items-center justify-center overflow-hidden transition-all duration-75 bg-canvas flex-shrink-0 border-b border-hairline/10"
            >
              <svg
                className={cn(
                  "h-6 w-6 text-brand transition-transform",
                  isRefreshing ? "animate-spin" : ""
                )}
                style={{
                  transform: isRefreshing ? undefined : `rotate(${pullProgress * 4}deg)`,
                }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <title>سحب للتحديث</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89"
                />
              </svg>
            </div>
          )}
          <div className="w-full max-w-6xl mx-auto px-4 lg:px-8 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:py-6 flex flex-col min-h-full min-w-0">
            {children}
          </div>
        </div>
      </main>

      {/* شريط التبويب السفلي للموبايل */}
      <nav aria-label="التنقل الرئيسي" className="lg:hidden flex-shrink-0 h-[calc(64px+env(safe-area-inset-bottom))] min-h-[64px] bg-paper border-t border-hairline flex items-start pb-[env(safe-area-inset-bottom)] justify-around z-sticky">
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
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-16 text-[11px] transition-colors border-t-2 border-transparent",
                isActive
                  ? "text-brand font-bold border-brand bg-brand-soft/40"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          aria-label="فتح المزيد"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 flex-1 h-16 text-[11px] transition-colors border-t-2 border-transparent",
                isMoreActive
                  ? "text-brand font-bold border-brand bg-brand-soft/40"
                  : "text-ink-3 hover:text-ink-2",
          )}
        >
          <Menu className="w-5 h-5" />
          <span>المزيد</span>
        </button>
      </nav>

      {/* شيت المزيد باستخدام المكون المشترك */}
      <ResponsiveModal
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="المزيد"
      >
        <div className="py-1">
          {moreNavGroups.map((group) => (
            <section key={group.label} className="space-y-1">
              <h3 className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide text-ink-3">
                {group.label}
              </h3>
              {group.items.map((item) => {
                const isActive =
                  !item.href.includes("?") &&
                  (pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href)));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 min-h-[48px] text-sm transition-colors rounded-lg",
                      isActive
                        ? "text-brand font-bold bg-brand-soft"
                        : "text-ink-2 hover:bg-canvas hover:text-ink",
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}

          <button
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              setIsBackupOpen(true);
            }}
            className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm transition-colors rounded-lg text-ink-2 hover:bg-canvas hover:text-ink font-medium"
          >
            <Database className="w-5 h-5 flex-shrink-0 text-brand" />
            <span>تصدير نسخة احتياطية</span>
          </button>
        </div>
        <div className="pt-4 border-t border-hairline mt-2">
          <InstallButton />
        </div>
      </ResponsiveModal>

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
      />
    </div>
  );
}
