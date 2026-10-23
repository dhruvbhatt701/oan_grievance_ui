import { EMAIL_MAX_LENGTH, EMAIL_PATTERN } from '@/lib/validation/fieldRules';
import { isEthiopianDialCode, isValidLocalPhoneForCountry } from '@/lib/validation/phone';

// Rules for the organisation onboarding form. Pure functions returning *what is
// wrong* (a code the form turns into translated copy), not the sentence itself —
// the form's strings live in messages/*.json like the rest of this screen's.

export const ORGANISATION_FIELDS = [
  'legalName',
  'brandName',
  'entityType',
  'taxId',
  'representativeName',
  'memberCount',
  'streetAddress',
  'kebele',
  'woreda',
  'zone',
  'region',
  'country',
  'postalCode',
  'website',
  'email',
  'phoneNumber',
] as const;

export type OrganisationField = (typeof ORGANISATION_FIELDS)[number];

/** Every field's text, plus the phone's dial code (not a validated field itself, but it changes what a valid number is). */
export type OrganisationValues = Record<OrganisationField | 'phoneCode', string>;

export type OrganisationProblem =
  | {
      code:
        | 'required'
        | 'taxId'
        | 'email'
        | 'phone'
        | 'phoneEthiopia'
        | 'postalCode'
        | 'postalCodeEthiopia'
        | 'website'
        | 'entityType'
        | 'memberCount';
    }
  | { code: 'tooLong'; max: number };

export type OrganisationProblems = Partial<Record<OrganisationField, OrganisationProblem>>;

/** Frappe's Data fieldtype default — what a name or address line can hold. */
export const TEXT_MAX_LENGTH = 140;
export const WEBSITE_MAX_LENGTH = 255;
/** The backend's ceiling for a Cooperative / FPO's member count (`MEMBERS_MAX` in oan_grievance_service). */
export const MEMBER_COUNT_MAX = 100_000_000;

/** Fields the reference design marks required, plus the authorised representative. */
const REQUIRED_FIELDS: readonly OrganisationField[] = [
  'legalName',
  'entityType',
  'taxId',
  'representativeName',
  'streetAddress',
  'zone',
  'region',
  'country',
  'postalCode',
  'email',
  'phoneNumber',
];

/** Fields that are free text of at most `TEXT_MAX_LENGTH`. */
const TEXT_FIELDS: readonly OrganisationField[] = [
  'legalName',
  'brandName',
  'representativeName',
  'streetAddress',
  'kebele',
  'woreda',
  'zone',
  'region',
  'country',
];

/**
 * The organisation's registration number — the form's `taxId` field. It follows
 * the backend's rule (`REGISTRATION_PATTERN` in oan_grievance_service's
 * services/identity.py, applied by `POST /orgs`): 3-60 letters and digits, with
 * single `-` or `/` between groups. The same number is asked at sign-up, so the
 * reference design's narrower "9-10 characters" tax-number hint would reject
 * one typed there.
 */
export const TAX_ID_PATTERN = /^(?=.{3,60}$)[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/;

/** Digits only, 3-10 of them — Ethiopia's own codes are exactly 4 (below), other countries' vary in length. */
export const POSTAL_CODE_PATTERN = /^\d{3,10}$/;

/** The longest postal code the field takes, so the input can stop there. */
export const POSTAL_CODE_MAX_LENGTH = 10;

/** A postal code as typed or pasted, with everything but digits dropped — the field takes digits only. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Ethiopia's postal codes are exactly 4 digits: region, central office, then the delivery office. */
export const ETHIOPIA_POSTAL_CODE_PATTERN = /^\d{4}$/;

/** True when the free-text country is Ethiopia — what switches the postal code to the 4-digit rule. */
export function isEthiopia(country: string): boolean {
  return country.trim().toLowerCase() === 'ethiopia';
}

/**
 * The address to send for what the user typed, or null if it isn't a website.
 * A bare "example.org" is accepted and given `https://`, since that is how
 * people write one; anything with whitespace, a non-web scheme or no dot in
 * the host is not.
 */
export function normaliseWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  // `@` is refused outright: "https://a@b.c" parses as a URL with a username, but nobody means an email address or credentials here.
  if (!trimmed || /[\s@]/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
    const hasDottedHost = /^[^.]+(\.[^.]+)+$/.test(url.hostname);
    return isWeb && hasDottedHost ? withScheme : null;
  } catch {
    return null;
  }
}

/**
 * What is wrong with one field, or null if it is fine. Takes all the values
 * because the phone number's validity depends on the dial code beside it.
 * `entityTypes` is the dropdown for the screen's kind, so a value that was
 * never one of its options (a stale selection, a hand-built request) fails.
 */
export function validateOrganisationField(
  field: OrganisationField,
  values: OrganisationValues,
  entityTypes: readonly string[]
): OrganisationProblem | null {
  const value = values[field].trim();

  if (!value) return REQUIRED_FIELDS.includes(field) ? { code: 'required' } : null;

  if (TEXT_FIELDS.includes(field) && value.length > TEXT_MAX_LENGTH) {
    return { code: 'tooLong', max: TEXT_MAX_LENGTH };
  }

  switch (field) {
    case 'entityType':
      return entityTypes.includes(value) ? null : { code: 'entityType' };
    case 'taxId':
      return TAX_ID_PATTERN.test(value) ? null : { code: 'taxId' };
    case 'postalCode':
      if (isEthiopia(values.country)) return ETHIOPIA_POSTAL_CODE_PATTERN.test(value) ? null : { code: 'postalCodeEthiopia' };
      return POSTAL_CODE_PATTERN.test(value) ? null : { code: 'postalCode' };
    case 'memberCount':
      // A whole number from 0 — what `members_affected` takes.
      return /^\d+$/.test(value) && Number(value) <= MEMBER_COUNT_MAX ? null : { code: 'memberCount' };
    case 'website':
      if (value.length > WEBSITE_MAX_LENGTH) return { code: 'tooLong', max: WEBSITE_MAX_LENGTH };
      return normaliseWebsite(value) ? null : { code: 'website' };
    case 'email':
      return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value) ? null : { code: 'email' };
    case 'phoneNumber':
      if (isValidLocalPhoneForCountry(value, values.phoneCode)) return null;
      return { code: isEthiopianDialCode(values.phoneCode) ? 'phoneEthiopia' : 'phone' };
    default:
      return null;
  }
}

/** Every field's problem, for a submit. Empty when the form is good to send. */
export function validateOrganisation(values: OrganisationValues, entityTypes: readonly string[]): OrganisationProblems {
  const problems: OrganisationProblems = {};
  for (const field of ORGANISATION_FIELDS) {
    const problem = validateOrganisationField(field, values, entityTypes);
    if (problem) problems[field] = problem;
  }
  return problems;
}
