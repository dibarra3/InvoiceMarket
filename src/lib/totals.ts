export type TotalsInput = {
  qty: number;
  rate: number;
}[];

export type Totals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export function computeTotals(
  items: TotalsInput,
  discountPercent: number,
  taxRate: number
): Totals {
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount;
  return { subtotal, discountAmount, taxAmount, total };
}
