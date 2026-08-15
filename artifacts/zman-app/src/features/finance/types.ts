import type { expense, purchase, sale, receivable, receivablePayment } from "./db";

export type Purchase = typeof purchase.$inferSelect;
export type NewPurchase = typeof purchase.$inferInsert;

export type Expense = typeof expense.$inferSelect;
export type NewExpense = typeof expense.$inferInsert;

export type Sale = typeof sale.$inferSelect;
export type NewSale = typeof sale.$inferInsert;

export type Receivable = typeof receivable.$inferSelect;
export type NewReceivable = typeof receivable.$inferInsert;

export type ReceivablePayment = typeof receivablePayment.$inferSelect;
export type NewReceivablePayment = typeof receivablePayment.$inferInsert;

export interface ReceivableWithPayments extends Receivable {
  paidAmountCents: number;
  remainingCents: number;
  status: "open" | "paid";
  payments: (ReceivablePayment & { accountName?: string })[];
}
