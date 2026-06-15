export const sessionUnitAmountCents = 5500;
export const sessionPriceLabel = "$55";
export const sessionCurrency = "usd";
export const sessionLineItemName = "Elite Soccer Training CV - Single Session";

export type LaunchPassType = "four_session_launch_pass" | "six_session_launch_pass";

export const launchPassExpirationDate = "2026-06-30T23:59:59-07:00";

export const launchPassOptions: Record<
  LaunchPassType,
  {
    passType: LaunchPassType;
    title: string;
    price: string;
    amountCents: number;
    credits: number;
    description: string;
    stripeLineItemName: string;
  }
> = {
  four_session_launch_pass: {
    passType: "four_session_launch_pass",
    title: "4-Session Launch Pass",
    price: "$200",
    amountCents: 20000,
    credits: 4,
    description: "Best for players who want consistent training through the end of June.",
    stripeLineItemName: "Elite Soccer Training CV - 4-Session Launch Pass"
  },
  six_session_launch_pass: {
    passType: "six_session_launch_pass",
    title: "6-Session Launch Pass",
    price: "$285",
    amountCents: 28500,
    credits: 6,
    description: "Best for committed players training multiple times per week.",
    stripeLineItemName: "Elite Soccer Training CV - 6-Session Launch Pass"
  }
};

export const pricingOptions = [
  {
    title: "Single Session",
    price: "$55",
    description: "Best for players trying EST CV or booking one session."
  },
  launchPassOptions.four_session_launch_pass,
  launchPassOptions.six_session_launch_pass
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

export function getLaunchPassOption(passType: LaunchPassType) {
  return launchPassOptions[passType];
}
