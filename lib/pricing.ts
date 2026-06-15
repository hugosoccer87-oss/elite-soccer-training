export const sessionUnitAmountCents = 5500;
export const sessionPriceLabel = "$55";
export const sessionCurrency = "usd";
export const sessionLineItemName = "Elite Soccer Training CV - Single Session";

export const pricingOptions = [
  {
    title: "Single Session",
    price: "$55",
    description: "Best for players trying EST CV or booking one session."
  },
  {
    title: "4-Session Launch Pass",
    price: "$200",
    description: "Best for players who want consistent training through the end of June."
  },
  {
    title: "6-Session Launch Pass",
    price: "$285",
    description: "Best for committed players training multiple times per week."
  }
];

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
