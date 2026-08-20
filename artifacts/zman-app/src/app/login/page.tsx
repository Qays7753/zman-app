"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import { InstallFab } from "@/components/pwa/InstallFab";
import { BrandMark } from "@/components/brand/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passcode) {
      setError("الرجاء إدخل رمز الدخول");
      return;
    }

    startTransition(async () => {
      const res = await loginAction(passcode);
      if (res.success) {
        try {
          localStorage.setItem("zman_last_active", String(Date.now()));
        } catch {
          // ignore
        }
        // يكفي انتقال واحد بعد أن تضبط Server Action الكوكي؛
        // refresh ثم push كانا يبدآن انتقالين متتاليين ويبطئان أول فتح.
        router.replace("/");
      } else {
        setError(res.error || "حدث خطأ غير متوقع");
      }
    });
  };

  return (
    <div
      className="min-h-dvh bg-canvas text-ink font-sans flex flex-col items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <div className="max-w-md w-full bg-paper border border-hairline p-5 sm:p-8 rounded-2xl shadow-elev-2 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <BrandMark size="lg" />
          <h2 className="font-display text-3xl font-semibold tracking-wide text-brand-deep">Zman Greens JO</h2>
          <div className="h-px w-12 bg-brand-gold" aria-hidden="true" />
          <p className="text-sm text-ink-2 leading-relaxed">
            الرجاء إدخال رمز الدخول للوصول إلى لوحة التحكم والبيانات المالية.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            id="passcode"
            type="password"
            label="رمز الدخول السري"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••••••"
            disabled={isPending}
            error={error || undefined}
            icon={<Lock className="w-4 h-4" />}
          />

          <Button
            type="submit"
            isLoading={isPending}
            className="w-full"
          >
            دخول
          </Button>
        </form>

        <div className="text-center">
          <p className="text-xs text-ink-2 leading-relaxed">
            المشروع مؤمن مؤقتاً لحماية سرية البيانات والعمليات التجارية.
          </p>
        </div>
      </div>

      {/* زر التثبيت الدائري الذكي — أسفل مربّع الدخول (يظهر فقط عند إمكان التثبيت) */}
      <div className="mt-6">
        <InstallFab />
      </div>
    </div>
  );
}
