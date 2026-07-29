"use client";

import { Landmark, User } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useCallback } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { HeaderIconButton } from "@/components/shared/HeaderIconButton";
import { PageToolbar } from "@/components/shared/PageToolbar";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";

const AccountsTab = dynamic(
  () =>
    import("@/features/finance/components/AccountsTab").then((m) => m.AccountsTab),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const OwnerTab = dynamic(
  () =>
    import("@/features/finance/components/OwnerTab").then((m) => m.OwnerTab),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const TABS = [
  { id: "accounts", label: "الحسابات والصناديق", icon: Landmark },
  { id: "owner", label: "المسحوبات والحقن", icon: User },
] as const;

export default function AccountsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const activeTab = searchParams.get("tab") || "accounts";

  const currentQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(currentQuery);

  useEffect(() => { setSearchInput(currentQuery); }, [currentQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === currentQuery) return;
      const params = new URLSearchParams(searchParams.toString());
      if (searchInput) params.set("search", searchInput);
      else params.delete("search");
      router.replace(`${pathname}?${params.toString()}`);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, currentQuery, pathname, router, searchParams]);

  const handleTabChange = useCallback((tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    params.delete("search");
    params.delete("type");
    params.delete("newAccount");
    params.delete("newOwnerTx");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [searchParams, pathname, router, startTransition]);

  const filters = activeTab === "owner" ? [{
    key: "type",
    label: "النوع",
    value: searchParams.get("type") || "all",
    options: [
      { value: "all", label: "الكل" },
      { value: "draw", label: "مسحوبات شخصية" },
      { value: "inject", label: "حقن رأس مال" },
    ],
    onChange: (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val === "all") params.delete("type");
      else params.set("type", val);
      router.replace(`${pathname}?${params.toString()}`);
    },
  }] : null;

  const handleAdd = useCallback(() => {
    const paramMap: Record<string, string> = {
      accounts: "newAccount",
      owner: "newOwnerTx",
    };
    const queryParam = paramMap[activeTab];
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, "true");
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, searchParams, pathname, router]);

  const addLabel: Record<string, string> = {
    accounts: "حساب جديد",
    owner: "معاملة مالك جديدة",
  };

  return (
    <>
      <AppShellHeader
        title=""
        action={
          <PageToolbar
            leading={
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab;
                  const Icon = tab.icon;
                  return (
                    <HeaderIconButton
                      key={tab.id}
                      label={tab.label}
                      isActive={isActive}
                      onClick={() => handleTabChange(tab.id)}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                    </HeaderIconButton>
                  );
                })}
              </div>
            }
            search={{
              value: searchInput,
              onChange: setSearchInput,
              placeholder:
                activeTab === "accounts"
                  ? "البحث في الحسابات..."
                  : "البحث في المعاملات الشخصية...",
            }}
            reserveSearchSpace={true}
            filters={filters || undefined}
            reserveFilterSpace={true}
            reserveMenuSpace={false}
          />
        }
      />

      <div className="flex-1 flex flex-col gap-6 pt-4">
        <div className="flex-1 flex flex-col">
          {activeTab === "accounts" && <AccountsTab />}
          {activeTab === "owner" && <OwnerTab />}
        </div>
      </div>

      <FloatingActionButton
        onClick={handleAdd}
        label={addLabel[activeTab] || ""}
      />
    </>
  );
}
