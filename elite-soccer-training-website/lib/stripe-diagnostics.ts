export type StripePaymentVerificationResult = {
  checkedAt: string;
  source: "success-page" | "verify-session-api" | "webhook";
  verified: boolean;
  sessionId?: string;
  bookingId?: string;
  sessionStatus?: string;
  paymentStatus?: string;
  message?: string;
};

type StripeDiagnosticsStore = {
  lastPaymentVerificationResult: StripePaymentVerificationResult | null;
};

const globalDiagnostics = globalThis as typeof globalThis & {
  __estStripeDiagnostics?: StripeDiagnosticsStore;
};

const diagnosticsStore =
  globalDiagnostics.__estStripeDiagnostics ??
  (globalDiagnostics.__estStripeDiagnostics = {
    lastPaymentVerificationResult: null
  });

export function setLastPaymentVerificationResult(
  result: Omit<StripePaymentVerificationResult, "checkedAt">
) {
  diagnosticsStore.lastPaymentVerificationResult = {
    checkedAt: new Date().toISOString(),
    ...result
  };
}

export function getLastPaymentVerificationResult() {
  return diagnosticsStore.lastPaymentVerificationResult;
}
