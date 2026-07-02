export const sessionUnitAmountCents = 5500;
export const sessionPriceLabel = "$55";
export const sessionCurrency = "usd";
export const sessionLineItemName = "Elite Soccer Training CV - Single Session";

export type LaunchPassType = "four_session_launch_pass" | "six_session_launch_pass";
export type DirectPaymentOption = "single_session" | LaunchPassType;

export const launchPassExpirationDate = "2099-12-31T23:59:59Z";

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
    title: "4-Session Training Package",
    price: "$200",
    amountCents: 20000,
    credits: 4,
    description: "4 training credits for EST CV small group training.",
    stripeLineItemName: "Elite Soccer Training CV - 4-Session Training Package"
  },
  six_session_launch_pass: {
    passType: "six_session_launch_pass",
    title: "6-Session Training Package",
    price: "$285",
    amountCents: 28500,
    credits: 6,
    description: "6 training credits for EST CV small group training.",
    stripeLineItemName: "Elite Soccer Training CV - 6-Session Training Package"
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

export const directPaymentOptions: Record<
  DirectPaymentOption,
  {
    option: DirectPaymentOption;
    title: string;
    amountCents: number;
    price: string;
    stripeLineItemName: string;
  }
> = {
  single_session: {
    option: "single_session",
    title: "Single Session",
    amountCents: sessionUnitAmountCents,
    price: sessionPriceLabel,
    stripeLineItemName: sessionLineItemName
  },
  four_session_launch_pass: {
    option: "four_session_launch_pass",
    title: launchPassOptions.four_session_launch_pass.title,
    amountCents: launchPassOptions.four_session_launch_pass.amountCents,
    price: launchPassOptions.four_session_launch_pass.price,
    stripeLineItemName: launchPassOptions.four_session_launch_pass.stripeLineItemName
  },
  six_session_launch_pass: {
    option: "six_session_launch_pass",
    title: launchPassOptions.six_session_launch_pass.title,
    amountCents: launchPassOptions.six_session_launch_pass.amountCents,
    price: launchPassOptions.six_session_launch_pass.price,
    stripeLineItemName: launchPassOptions.six_session_launch_pass.stripeLineItemName
  }
};

export function getDirectPaymentOption(option: DirectPaymentOption) {
  return directPaymentOptions[option];
}
