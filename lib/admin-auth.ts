import { createHash, timingSafeEqual } from "node:crypto";

export const adminSessionCookie = "est_admin_session";

export function getAdminPasscode() {
  return process.env.ADMIN_PASSCODE?.trim() || null;
}

export function getAdminSessionValue() {
  const passcode = getAdminPasscode();

  if (!passcode) {
    return null;
  }

  return createHash("sha256").update(passcode).digest("hex");
}

export function validateAdminPasscode(value: string) {
  const passcode = getAdminPasscode();

  if (!passcode) {
    return {
      configured: false,
      valid: false
    };
  }

  const input = Buffer.from(value);
  const expected = Buffer.from(passcode);
  const valid = input.length === expected.length && timingSafeEqual(input, expected);

  return {
    configured: true,
    valid
  };
}
