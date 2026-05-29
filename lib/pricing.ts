export const sessionUnitAmountCents = 5500;
export const sessionPriceLabel = "$55";
export const sessionCurrency = "usd";
export const sessionLineItemName = "Elite Soccer Training - Small Group Session";

export function getSessionTotalCents(players: string | number) {
  const playerCount = Math.max(1, Number(players) || 1);
  return playerCount * sessionUnitAmountCents;
}

export function formatCurrencyFromCents(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}
