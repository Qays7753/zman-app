import { redirect } from "next/navigation";

// Issue #13 — «الحسابات والصناديق» صارت تبويباً رابعاً داخل /finance.
// نُبقي هذا الطريق كإعادة توجيه فقط لئلا تُكسر الإشارات المرجعية والروابط القديمة.
export default function AccountsPageRedirect() {
  redirect("/finance?tab=accounts");
}
