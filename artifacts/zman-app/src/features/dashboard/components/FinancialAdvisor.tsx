"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Wallet, User, ShoppingCart, ArrowDownRight, ChevronDown, ChevronUp } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";

interface AdvisorData {
  realCash: number;
  opening: number;
  ownerNet: number;
  ownerInject: number;
  ownerDraw: number;
  depositsHeld: number;
  expectedRemaining: number;
  netProfit: number;
  actualSales: number;
  purchases: number;
  expenses: number;
  avgMonthlySpend: number;
}

function fmt(amount: number): string {
  return (amount / 1000).toFixed(3);
}

/** health state descriptor */
function getHealthState(d: AdvisorData): { label: string; color: string; icon: typeof TrendingUp } {
  if (d.netProfit > 0 && d.realCash > 0) {
    if (d.ownerDraw > d.netProfit) {
      return { label: "🟠 تحتاج انتباه", color: "text-amber-600", icon: TrendingDown };
    }
    return { label: "🟢 وضع قوي", color: "text-info", icon: TrendingUp };
  }
  if (d.netProfit === 0 && d.realCash > 0) {
    return { label: "🟡 مستقرة", color: "text-amber-600", icon: Minus };
  }
  if (d.netProfit < 0) {
    return { label: "🟠 تحتاج انتباه", color: "text-amber-600", icon: TrendingDown };
  }
  return { label: "🟡 بداية", color: "text-amber-600", icon: Minus };
}

/** rule-based advisor engine — handles every scenario */
function generateAdvice(d: AdvisorData): { summary: string; sections: { title: string; body: string[] }[] } {
  // --- empty state ---
  const isEmpty = d.realCash === 0 && d.netProfit === 0 && d.actualSales === 0 && d.depositsHeld === 0;
  if (isEmpty) {
    return {
      summary: "بدايتك جديدة — لسه ما في أرقام كافية لتحليل دقيق.",
      sections: [{
        title: "مرحباً بك في زمن",
        body: [
          "هذا أول يوم لك في النظام. ابدأ بتسجيل رأس المال الافتتاحي، ثم أنشئ أول طلب أو سجّل أول عملية بيع.",
          "بمجرد أن تبدأ الحركات المالية بالظهور، ستجد هنا تحليلاً مفصّلاً لوضعك المالي بلغة بسيطة وواضحة.",
        ],
      }],
    };
  }

  const sections: { title: string; body: string[] }[] = [];

  // --- Section 1: كم تملك فعلاً؟ ---
  const cashParts: string[] = [];
  if (d.opening > 0) {
    cashParts.push(`رأس مالك الأول: ${fmt(d.opening)} د.أ — هذا المبلغ وضعته في بداية المشروع، وهو ليس ربحاً بل أصل.`);
  }
  if (d.ownerNet !== 0) {
    if (d.ownerNet > 0) {
      cashParts.push(`صافي ما أضفته للمشروع: ${fmt(d.ownerNet)} د.أ — أودعت أكثر مما سحبت.`);
    } else {
      cashParts.push(`صافي ما سحبته من المشروع: ${fmt(Math.abs(d.ownerNet))} د.أ — سحبت أكثر مما أودعت.`);
    }
  }
  if (d.depositsHeld > 0) {
    const depositShare = d.realCash > 0 ? (d.depositsHeld / d.realCash) * 100 : 0;
    cashParts.push(`عربونات لسه ما سلّمتها: ${fmt(d.depositsHeld)} د.أ — هذا نقد تقدر تصرفه، لكنه التزام: لازم تسلّم الطلبات أو ترجع المبلغ.${depositShare > 40 ? ` وتمثّل ${depositShare.toFixed(0)}% من نقدك — نسبة كبيرة، تأكّد من قدرتك على التسليم.` : ""}`);
  }
  cashParts.push(`ربحك المحقَّق: ${fmt(d.netProfit)} د.أ — هذا ما ربحه عملك فعلاً.`);
  const composed = d.opening + d.ownerNet + d.depositsHeld + d.netProfit;
  const residual = d.realCash - composed;

  const s1Body: string[] = [];
  s1Body.push(`نقدك المتاح الآن: ${fmt(d.realCash)} د.أ.`);
  if (d.netProfit > 0 && d.realCash > d.netProfit) {
    s1Body.push(`لاحظ أن نقدك أكبر من ربحك. هذا طبيعي وليس خطأ — نقدك ليس كله ربحاً.`);
  } else if (d.realCash < d.netProfit && d.netProfit > 0) {
    s1Body.push(`نقدك أقل من ربحك. هذا يعني أن جزءاً من ربحك خرج من الصندوق — غالباً سحوبات شخصية أو مشتريات مدفوعة.`);
  } else if (Math.abs(d.realCash - d.netProfit) < 1) {
    s1Body.push(`نقدك يساوي تقريباً ربحك — وضع بسيط ونظيف.`);
  }
  s1Body.push(...cashParts);
  if (Math.abs(residual) > 1) {
    s1Body.push(`تسويات أخرى: ${fmt(residual)} د.أ.`);
  }
  s1Body.push(`المجموع = ${fmt(composed + residual)} د.أ = نقدك الفعلي.`);

  sections.push({ title: "① كم تملك فعلاً؟", body: s1Body });

  // --- Section 2: هل عملك مربح؟ ---
  const s2Body: string[] = [];
  if (d.actualSales === 0) {
    s2Body.push("لا توجد مبيعات مسجَّلة بعد في هذه الفترة. الربح صفر لأنه لا يوجد إيراد.");
  } else {
    s2Body.push(`بعت بـ ${fmt(d.actualSales)} د.أ، واشتريت مواد بـ ${fmt(d.purchases)} د.أ، وصرفت ${fmt(d.expenses)} د.أ مصاريف تشغيلية.`);
    if (d.netProfit > 0) {
      s2Body.push(`صافي ربحك: ${fmt(d.netProfit)} د.أ — عملك يربح.`);
    } else if (d.netProfit === 0) {
      s2Body.push(`صافي ربحك: صفر — المبيعات تغطّي بالضبط ما صرفته. لا ربح ولا خسارة.`);
    } else {
      s2Body.push(`صافي نتيجتك: خسارة ${fmt(Math.abs(d.netProfit))} د.أ.`);
      s2Body.push("لا تقلق — في نظام الكاش، شهر تشتري فيه مواد كثيرة يظهر كخسارة، لكن المواد تبقى وتُباع لاحقاً. هذا طبيعي وليس فشلاً.");
    }
    // margin
    const margin = (d.netProfit / d.actualSales) * 100;
    if (margin > 0) {
      s2Body.push(`هامش ربحك: ${margin.toFixed(0)}% — يعني من كل 100 دينار مبيعات، يتبقّى ${margin.toFixed(0)} دينار ربحاً.`);
    } else if (margin < 0) {
      s2Body.push(`هامشك سالب: ${margin.toFixed(0)}% — تصرف أكثر مما تبيع. إذا تكرّر هذا، راجع أسعارك أو مصاريفك.`);
    }
  }

  sections.push({ title: "② هل عملك مربح؟", body: s2Body });

  // --- Section 3: ماذا عن راتبك الشخصي؟ ---
  const s3Body: string[] = [];
  if (d.ownerDraw === 0 && d.ownerInject === 0) {
    s3Body.push("لم تسحب أو تودع لنفسك في هذه الفترة — كل النقد في المشروع.");
  } else {
    if (d.ownerDraw > 0) {
      s3Body.push(`سحبت ${fmt(d.ownerDraw)} د.أ لنفسك في هذه الفترة.`);
    }
    if (d.ownerInject > 0) {
      s3Body.push(`أودعت ${fmt(d.ownerInject)} د.أ من مالك الشخصي في المشروع.`);
    }
    s3Body.push("سحوباتك الشخصية لا تُحتسب كمصروف — الربح يقيس أداء العمل، وليد ما تأخذه لنفسك. لو احتسبناها، شهر تسحب فيه يظهر كخسارة وهذا مضلّل.");
    if (d.netProfit > 0 && d.ownerDraw > 0) {
      const drawRatio = (d.ownerDraw / d.netProfit) * 100;
      const afterDraw = d.netProfit - d.ownerDraw;
      if (d.ownerDraw > d.netProfit) {
        s3Body.push(`تسحب أكثر مما يربحه المشروع حالياً (${drawRatio.toFixed(0)}% من الربح). المتبقّي بعد سحوباتك: ${fmt(afterDraw)} د.أ — هذا يعني أن النقد ينقص تدريجياً.`);
      } else {
        s3Body.push(`تسحب ${drawRatio.toFixed(0)}% من ربحك. المتبقّي بعد سحوباتك: ${fmt(afterDraw)} د.أ.`);
      }
    } else if (d.netProfit <= 0 && d.ownerDraw > 0) {
      s3Body.push(`سحبت ${fmt(d.ownerDraw)} د.أ بينما المشروع لا يربح حالياً. هذا يقلّل النقد المتاح.`);
    }
  }

  sections.push({ title: "③ ماذا عن راتبك الشخصي؟", body: s3Body });

  // --- Section 4: ماذا ينتظرك؟ ---
  const s4Body: string[] = [];
  if (d.expectedRemaining > 0 && d.avgMonthlySpend > 0) {
    const forecast = d.expectedRemaining - d.avgMonthlySpend;
    s4Body.push(`لديك طلبات قيد التنفيذ بقيمة متبقّية ${fmt(d.expectedRemaining)} د.أ ستُحصَّل عند تسليمها.`);
    s4Body.push(`متوسط إنفاقك الشهري (مشتريات + مصاريف) في آخر 3 أشهر: ${fmt(d.avgMonthlySpend)} د.أ.`);
    s4Body.push(`تقدير ربح الشهر القادم ≈ ${fmt(forecast)} د.أ — هذا تقدير تقريبي بناءً على طلباتك المسجَّلة ومتوسط إنفاقك السابق. قد يتغيّر.`);
  } else if (d.expectedRemaining > 0 && d.avgMonthlySpend === 0) {
    s4Body.push(`لديك طلبات قيد التنفيذ بقيمة متبقّية ${fmt(d.expectedRemaining)} د.أ ستُحصَّل عند تسليمها.`);
    s4Body.push("لا يوجد سجل إنفاق كافٍ لتقدير متوسط مصاريفك الشهرية بعد — لسه بدري نقدّر ربح الشهر القادم.");
  } else if (d.expectedRemaining === 0 && d.avgMonthlySpend > 0) {
    s4Body.push("لا توجد طلبات قيد التنفيذ حالياً — لا يوجد إيراد متوقع من تسليمات قادمة.");
    s4Body.push(`متوسط إنفاقك الشهري: ${fmt(d.avgMonthlySpend)} د.أ. ستحتاج لطلبات جديدة لتغطية هذا الإنفاق.`);
  } else {
    s4Body.push("لا توجد طلبات قيد التنفيذ ولا سجل إنفاق كافٍ بعد — ابدأ بإنشاء طلبات وتسجيل عمليات ليظهر لك تقدير دقيق.");
  }

  sections.push({ title: "④ ماذا ينتظرك؟", body: s4Body });

  // summary line
  const health = getHealthState(d);
  let summary = health.label + " — ";
  if (d.netProfit > 0) {
    summary += `عملك يربح ${fmt(d.netProfit)} د.أ`;
    if (d.ownerDraw > d.netProfit) summary += "، لكن تسحب أكثر من ربحك";
  } else if (d.netProfit < 0) {
    summary += `عملك يسجّل خسارة ${fmt(Math.abs(d.netProfit))} د.أ (طبيعي في شهر شراء كثيف)`;
  } else {
    summary += "لا يوجد ربح أو خسارة بعد";
  }
  if (d.depositsHeld > 0) summary += `، وعندك ${fmt(d.depositsHeld)} د.أ عربونات في ذمتك`;

  return { summary, sections };
}

export function FinancialAdvisor({ data }: { data: AdvisorData }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const advice = generateAdvice(data);
  const health = getHealthState(data);
  const HealthIcon = health.icon;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full p-4 bg-gradient-to-l from-info/10 to-info/5 rounded-lg border border-info/20 shadow-sm flex items-center justify-between gap-3 hover:border-info/40 transition-all"
      >
        <div className="flex items-center gap-2 min-w-0">
          <HealthIcon className={`h-5 w-5 ${health.color} shrink-0`} />
          <div className="text-right min-w-0">
            <p className="text-sm font-bold text-ink whitespace-nowrap">أخبرني عن وضعي المالي</p>
            <p className="text-[10px] text-ink/50 truncate">{advice.summary}</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-info shrink-0" />
      </button>

      <ResponsiveModal
        isOpen={open}
        onClose={() => { setOpen(false); setExpanded(false); }}
        title="تحليل وضعك المالي"
      >
        <div className="space-y-4 p-4">
          {/* summary line */}
          <div className="flex items-center gap-2 p-3 bg-info/5 rounded-lg border border-info/15">
            <HealthIcon className={`h-5 w-5 ${health.color} shrink-0`} />
            <p className="text-sm font-bold text-ink">{advice.summary}</p>
          </div>

          {/* sections */}
          {advice.sections.map((section, i) => (
            <div key={i} className="space-y-2">
              <h3 className="text-sm font-bold text-info border-b border-info/15 pb-1">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.body.map((line, j) => (
                  <p key={j} className="text-xs text-ink/70 leading-relaxed">{line}</p>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[10px] text-ink/40 pt-2 border-t border-hairline">
            هذا التحليل وصفي — يشرح وضعك الحالي بلغة بسيطة. القرار النهائي لك.
          </p>
        </div>
      </ResponsiveModal>
    </>
  );
}
