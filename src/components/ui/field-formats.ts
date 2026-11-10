// Input attributes for the fields with a fixed shape. Each mirrors the
// server's own rule, so a wrong value is flagged at the field, before Save,
// with the shape spelled out. The server still checks: these are a courtesy.
//
//   <Input name="mobile" required {...MOBILE_INPUT} />
//
// A field's own placeholder, written after the spread, wins.

/** isValidMobile (lib/domain/land-inquiry.ts): ten digits, starting 6–9. */
export const MOBILE_INPUT = {
  type: "tel",
  inputMode: "numeric",
  maxLength: 10,
  pattern: "[6-9][0-9]{9}",
  title: "10-digit mobile number starting with 6, 7, 8 or 9 — e.g. 9876543210",
  placeholder: "9876543210",
} as const;

/** isValidAadhaarFormat (lib/security/identity.ts): 12 digits, first 2–9; spaces or hyphens as printed on the card. */
export const AADHAAR_INPUT = {
  inputMode: "numeric",
  maxLength: 14,
  pattern: "[\\s\\-]*[2-9]([\\s\\-]*\\d){11}[\\s\\-]*",
  title: "12 digits, not starting with 0 or 1 — e.g. 2345 6789 0123",
  placeholder: "12 digits",
  autoComplete: "off",
} as const;

/** isValidPanFormat (lib/security/identity.ts): 5 letters, 4 digits, 1 letter. */
export const PAN_INPUT = {
  maxLength: 10,
  pattern: "[A-Za-z]{5}[0-9]{4}[A-Za-z]",
  title: "10 characters: 5 letters, 4 digits, 1 letter — e.g. ABCDE1234F",
  placeholder: "ABCDE1234F",
  autoComplete: "off",
} as const;

/** bank-service IFSC: 4 letters, a zero, then 6 letters or digits. */
export const IFSC_INPUT = {
  maxLength: 11,
  pattern: "[A-Za-z]{4}0[A-Za-z0-9]{6}",
  title: "11 characters: 4 letters, then 0, then 6 letters or digits — e.g. HDFC0001234",
  placeholder: "HDFC0001234",
} as const;

/** bank-service normaliseAccount: 6 to 20 digits; spaces are dropped. */
export const ACCOUNT_NUMBER_INPUT = {
  inputMode: "numeric",
  pattern: "\\s*(\\d\\s*){6,20}",
  title: "6 to 20 digits",
  autoComplete: "off",
} as const;
