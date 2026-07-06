"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems, mainNavItems, moreNavItems } from "@/config/nav";
import { InstallButton } from "@/components/pwa/InstallButton";
import { cn } from "@/lib/utils";
import { useAppShell } from "@/providers/app-shell-context";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function AppShell({ children, title: propTitle, action: propAction }: AppShellProps) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

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
        <div className="px-3 pb-4">
          <InstallButton />
        </div>
      </aside>

      {/* هيدر الموبايل */}
      <header className="lg:hidden flex-shrink-0 w-full h-14 bg-paper/90 backdrop-blur-sm shadow-sm border-b border-hairline flex items-center justify-between px-3 z-sticky">
        {title ? (
          <h1 className="text-base font-bold text-ink truncate">{title}</h1>
        ) : null}
        {action && (
          <div className={cn("flex items-center", !title ? "flex-1 w-full" : "ms-3")}>
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
              <div className={cn("flex items-center", !title ? "flex-1 w-full" : "ms-3")}>
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
                  "h-6 w-6 text-info transition-transform",
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
          <div className="w-full max-w-6xl mx-auto px-4 lg:px-8 py-4 lg:py-6 flex flex-col min-h-full min-w-0">
            {children}
          </div>
        </div>
      </main>

      {/* شريط التبويب السفلي للموبايل */}
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

      {/* شيت المزيد باستخدام المكون المشترك */}
      <ResponsiveModal
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="المزيد"
      >
        <div className="py-1">
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
                  "flex items-center gap-3 px-4 min-h-[48px] text-sm transition-colors rounded-lg",
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
        <div className="pt-4 border-t border-hairline mt-2">
          <InstallButton />
        </div>
      </ResponsiveModal>
    </div>
  );
}
