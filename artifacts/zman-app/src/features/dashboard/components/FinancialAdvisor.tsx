"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";

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

/** واصف الحالة المالية — وصفي بحت، لا نصيحة. */
function getHealthState(d: AdvisorData): { label: string; color: string; icon: typeof TrendingUp } {
  if (d.netProfit > 0) {
    return { label: "مربح", color: "text-brand", icon: TrendingUp };
  }
  if (d.netProfit < 0) {
    return { label: "خسارة الفترة", color: "text-alert", icon: TrendingDown };
  }
  return { label: "متعادل", color: "text-warn-deep", icon: Minus };
}

/**
 * محرّك التحليل — قواعد على الأرقام الفعلية. وصفي بحت (يشرح، لا ينصح).
 * الأرقام مطابقة تماماً لبطاقات الداشبورد. لا مبالغة في التنبؤ.
 */
function generateAdvice(d: AdvisorData): { summary: string; sections: { title: string; body: string[] }[] } {
  const unit = "د.أ";
  // الحالة الفارغة (مشروع جديد)
  const isEmpty = d.realCash === 0 && d.netProfit === 0 && d.actualSales === 0 && d.depositsHeld === 0;
  if (isEmpty) {
    return {
      summary: "المشروع في بدايته — لا توجد بعد أرقام كافية لتحليل مالي دقيق.",
      sections: [{
        title: "بداية المشروع",
        body: [
          "لم تُسجَّل حركات مالية كافية بعد. عند تسجيل الرصيد الافتتاحي وأول عمليات البيع والشراء، سيظهر هنا تحليل تفصيلي للوضع المالي.",
        ],
      }],
    };
  }

  const sections: { title: string; body: string[] }[] = [];

  // ① تركيبة النقد — يطابق بطاقة "الربح مقابل السيولة"
  const composed = d.opening + d.ownerNet + d.depositsHeld + d.netProfit;
  const residual = d.realCash - composed;
  const s1: string[] = [];
  s1.push(`النقد المتاح حالياً ${fmt(d.realCash)} ${unit}، وهو مزيج من عدّة مصادر لا يمثّل الربح وحده.`);
  if (d.opening > 0) {
    s1.push(`رأس المال الذي بدأ به المشروع: ${fmt(d.opening)} ${unit} — أصل، وليس ربحاً.`);
  }
  if (d.ownerNet > 0) {
    s1.push(`صافي إضافات المالك: ${fmt(d.ownerNet)} ${unit} — أُضيف للمشروع من المال الشخصي.`);
  } else if (d.ownerNet < 0) {
    s1.push(`صافي سحوبات المالك: (${fmt(Math.abs(d.ownerNet))}) ${unit} — المسحوب يفوق المُضاف.`);
  }
  if (d.depositsHeld > 0) {
    s1.push(`عربون مسلَّم مقدَّماً: ${fmt(d.depositsHeld)} ${unit} — نقد متاح للتصرّف، لكنه التزام مقابل طلبات لم تُسلَّم بعد.`);
  }
  s1.push(`الربح المحقَّق من العمل: ${fmt(d.netProfit)} ${unit}.`);
  if (Math.abs(residual) >= 1) {
    s1.push(`تسويات أخرى: ${fmt(residual)} ${unit}.`);
  }
  s1.push(`مجموع هذه المصادر يساوي النقد المتاح الفعلي: ${fmt(d.realCash)} ${unit}.`);
  sections.push({ title: "تركيبة النقد", body: s1 });

  // ② الربحية — يطابق بطاقة "صافي الربح"
  const s2: string[] = [];
  if (d.actualSales === 0) {
    s2.push("لا توجد مبيعات مكتملة في هذه الفترة، فصافي الربح يساوي صفراً.");
  } else {
    s2.push(`بلغت المبيعات المكتملة ${fmt(d.actualSales)} ${unit}، مقابل مشتريات (${fmt(d.purchases)}) ${unit} ومصاريف تشغيلية (${fmt(d.expenses)}) ${unit}.`);
    if (d.netProfit > 0) {
      s2.push(`صافي الربح ${fmt(d.netProfit)} ${unit}.`);
    } else if (d.netProfit === 0) {
      s2.push("صافي الربح صفر — المبيعات تعادل تماماً المشتريات والمصاريف.");
    } else {
      s2.push(`صافي النتيجة خسارة (${fmt(Math.abs(d.netProfit))}) ${unit}. في النظام النقدي، فترة الشراء المكثّف تظهر كخسارة لأن تكلفة المواد تُخصم فور شرائها بينما تُباع تدريجياً لاحقاً.`);
    }
    const margin = (d.netProfit / d.actualSales) * 100;
    if (d.netProfit > 0) {
      s2.push(`هامش صافي الربح ${margin.toFixed(0)}% — أي أن كل 100 دينار مبيعات ينتج عنها ${margin.toFixed(0)} ديناراً ربحاً.`);
    } else if (d.netProfit < 0) {
      s2.push(`هامش صافي الربح ${margin.toFixed(0)}% — الإنفاق يتجاوز المبيعات في هذه الفترة.`);
    }
  }
  sections.push({ title: "الربحية", body: s2 });

  // ③ سحوبات المالك — يطابق "صافي الربح بعد سحوبات المالك"
  const s3: string[] = [];
  if (d.ownerDraw === 0 && d.ownerInject === 0) {
    s3.push("لم تُسجَّل سحوبات أو إيداعات شخصية في هذه الفترة.");
  } else {
    if (d.ownerDraw > 0) s3.push(`بلغت السحوبات الشخصية ${fmt(d.ownerDraw)} ${unit} في هذه الفترة.`);
    if (d.ownerInject > 0) s3.push(`بلغت الإيداعات الشخصية ${fmt(d.ownerInject)} ${unit}.`);
    s3.push("السحوبات الشخصية لا تُخصم من صافي الربح لأنها ليست مصروفاً على العمل، لكنها تُنقص النقد المتاح.");
    if (d.ownerDraw > 0) {
      const afterDraw = d.netProfit - d.ownerDraw;
      if (d.netProfit > 0) {
        const ratio = (d.ownerDraw / d.netProfit) * 100;
        s3.push(`تمثّل السحوبات ${ratio.toFixed(0)}% من صافي الربح. المتبقّي بعد السحوبات: ${afterDraw < 0 ? `(${fmt(Math.abs(afterDraw))})` : fmt(afterDraw)} ${unit}.`);
      } else {
        s3.push(`المتبقّي بعد السحوبات: ${afterDraw < 0 ? `(${fmt(Math.abs(afterDraw))})` : fmt(afterDraw)} ${unit}.`);
      }
    }
  }
  sections.push({ title: "السحوبات الشخصية", body: s3 });

  // ④ النظرة المستقبلية — يطابق "الربح المتوقّع بعد تسليم طلباتك"
  // الربح المتوقّع = الربح الحالي + المتبقّي من الطلبات قيد التنفيذ (بلا مبالغة).
  const s4: string[] = [];
  if (d.expectedRemaining > 0) {
    const futureProfit = d.netProfit + d.expectedRemaining;
    s4.push(`لديك طلبات قيد التنفيذ يتبقّى تحصيله منها ${fmt(d.expectedRemaining)} ${unit} عند تسليمها (السعر ناقص العربون المحصَّل).`);
    s4.push(`عند تسليم هذه الطلبات بالكامل — بافتراض أن موادها اشتُريت مسبقاً — يصبح صافي الربح المتوقّع نحو ${futureProfit < 0 ? `(${fmt(Math.abs(futureProfit))})` : fmt(futureProfit)} ${unit}.`);
    s4.push("هذا تقدير مبني على الطلبات المسجَّلة حالياً، ويتحقّق تدريجياً مع كل تسليم.");
  } else {
    s4.push("لا توجد طلبات قيد التنفيذ حالياً، فلا إيراد متوقّع من تسليمات قادمة.");
  }
  sections.push({ title: "النظرة المستقبلية", body: s4 });

  // سطر الملخّص — وصفي، أرقام مطابقة
  const health = getHealthState(d);
  let summary = "";
  if (d.netProfit > 0) {
    summary = `المشروع مربح بصافي ${fmt(d.netProfit)} ${unit} في هذه الفترة`;
  } else if (d.netProfit < 0) {
    summary = `يسجّل المشروع خسارة (${fmt(Math.abs(d.netProfit))}) ${unit} في هذه الفترة`;
  } else {
    summary = "المشروع متعادل — لا ربح ولا خسارة في هذه الفترة";
  }
  if (d.depositsHeld > 0) summary += `، مع ${fmt(d.depositsHeld)} ${unit} عربونات مستحقّة التسليم`;
  summary += ".";

  return { summary: health.label + " — " + summary, sections };
}

export function FinancialAdvisor({ data }: { data: AdvisorData }) {
  const [expanded, setExpanded] = useState(false);
  const advice = generateAdvice(data);
  const health = getHealthState(data);
  const HealthIcon = health.icon;

  // السطر الثاني في العرض المطوي — أوّل سطر من أوّل قسم تحليلي
  const secondaryLine = advice.sections[0]?.body[0];

  return (
    <div className="rounded-xl border border-hairline bg-paper overflow-hidden">
      {/* الرأس: أيقونة الحالة + الملخّص + شارة الحالة */}
      <div className="p-4">
        <div className="flex items-start gap-2.5">
          <HealthIcon className={`h-5 w-5 ${health.color} shrink-0 mt-0.5`} />
          <p className="text-sm font-bold text-ink leading-relaxed line-clamp-2 min-w-0 flex-1">
            {advice.summary}
          </p>
          <span
            className={`text-[11px] font-bold ${health.color} shrink-0 mt-1 whitespace-nowrap`}
          >
            {health.label}
          </span>
        </div>
        {secondaryLine && !expanded && (
          <p className="text-xs text-ink-2 mt-1.5 line-clamp-1 ps-7">{secondaryLine}</p>
        )}
      </div>

      {/* زرّ التبديل — اقرأ المزيد / إخفاء التفاصيل */}
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 border-t border-hairline bg-warm/70 hover:bg-brand-soft/60 transition-colors text-sm font-bold text-brand"
      >
        <span>{expanded ? "إخفاء التفاصيل" : "اقرأ المزيد"}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* الأقسام التفصيلية — تظهر عند التوسيع */}
      {expanded && (
        <div className="space-y-4 p-4 border-t border-hairline bg-paper">
          {advice.sections.map((section, i) => (
            <div key={i} className="space-y-2">
              <h3 className="text-sm font-bold text-brand border-b border-brand/20 pb-1">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.body.map((line, j) => (
                  <p key={j} className="text-xs text-ink/70 leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[10px] text-ink/40 pt-2 border-t border-hairline">
            هذا التحليل وصفي — يشرح وضعك الحالي بلغة بسيطة. القرار النهائي لك.
          </p>
        </div>
      )}
    </div>
  );
}
