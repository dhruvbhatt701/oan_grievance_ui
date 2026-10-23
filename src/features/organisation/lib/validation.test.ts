import { describe, expect, it } from 'vitest';
import {
  digitsOnly,
  normaliseWebsite,
  ORGANISATION_FIELDS,
  validateOrganisation,
  validateOrganisationField,
  type OrganisationValues,
} from './validation';

const ENTITY_TYPES = ['Local NGO', 'Civil Society Organisation'];

const VALID: OrganisationValues = {
  legalName: 'Green Highlands Development Association',
  brandName: '',
  entityType: 'Local NGO',
  taxId: '0012345678',
  representativeName: 'Almaz Tesfaye',
  memberCount: '',
  streetAddress: 'Bole Road, Block 4',
  kebele: '',
  woreda: '',
  zone: 'Addis Ababa',
  region: 'Addis Ababa',
  country: 'Ethiopia',
  postalCode: '1000',
  website: '',
  email: 'info@greenhighlands.org',
  phoneCode: '+251',
  phoneNumber: '0911234567',
};

const check = (overrides: Partial<OrganisationValues>) =>
  validateOrganisation({ ...VALID, ...overrides }, ENTITY_TYPES);

describe('validateOrganisation', () => {
  it('accepts a complete form, leaving the optional fields empty', () => {
    expect(validateOrganisation(VALID, ENTITY_TYPES)).toEqual({});
  });

  it('requires exactly the fields the reference design marks required', () => {
    const empty = Object.fromEntries(ORGANISATION_FIELDS.map((f) => [f, ''])) as OrganisationValues;
    const problems = validateOrganisation({ ...empty, phoneCode: '+251' }, ENTITY_TYPES);
    expect(Object.keys(problems).sort()).toEqual(
      [
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
      ].sort()
    );
    for (const problem of Object.values(problems)) expect(problem).toEqual({ code: 'required' });
  });

  it('treats a whitespace-only value as empty', () => {
    expect(check({ legalName: '   ' }).legalName).toEqual({ code: 'required' });
  });

  it('rejects an over-long name or address line', () => {
    expect(check({ legalName: 'x'.repeat(141) }).legalName).toEqual({ code: 'tooLong', max: 140 });
    expect(check({ kebele: 'x'.repeat(141) }).kebele).toEqual({ code: 'tooLong', max: 140 });
    expect(check({ legalName: 'x'.repeat(140) }).legalName).toBeUndefined();
  });
});

describe('authorised representative', () => {
  it('is required, and limited to the length of a name', () => {
    expect(check({ representativeName: '  ' }).representativeName).toEqual({ code: 'required' });
    expect(check({ representativeName: 'x'.repeat(141) }).representativeName).toEqual({ code: 'tooLong', max: 140 });
    expect(check({ representativeName: 'Almaz Tesfaye' }).representativeName).toBeUndefined();
  });
});

describe('member count affected', () => {
  it('is optional', () => {
    expect(check({ memberCount: '' }).memberCount).toBeUndefined();
    expect(check({ memberCount: '   ' }).memberCount).toBeUndefined();
  });

  it('takes a whole number from 0 up to the backend limit', () => {
    for (const memberCount of ['0', '120', '100000000']) {
      expect(check({ memberCount }).memberCount).toBeUndefined();
    }
  });

  it('rejects anything else', () => {
    for (const memberCount of ['-1', '1.5', '12a', '1,200', '100000001', 'many']) {
      expect(check({ memberCount }).memberCount).toEqual({ code: 'memberCount' });
    }
  });
});

describe('entity type', () => {
  it('must be one of the options offered for this kind', () => {
    expect(check({ entityType: 'Cooperative Union' }).entityType).toEqual({ code: 'entityType' });
    expect(check({ entityType: 'Civil Society Organisation' }).entityType).toBeUndefined();
  });
});

describe('registration number', () => {
  // The backend's own rule for POST /orgs.
  it('takes 3-60 letters or digits, with single hyphens or slashes between groups', () => {
    for (const taxId of ['123', '0012345678', 'ET12345678', 'REG-2024-0042', 'COOP/XX/2024/0001', 'a'.repeat(60)]) {
      expect(check({ taxId }).taxId).toBeUndefined();
    }
  });

  it('rejects the wrong length, spaces, other symbols and doubled or dangling separators', () => {
    for (const taxId of ['12', 'a'.repeat(61), '1234 56789', '12345678!', '-123', '123-', 'AB--123', 'AB-/123']) {
      expect(check({ taxId }).taxId).toEqual({ code: 'taxId' });
    }
  });
});

describe('postal code', () => {
  it('accepts exactly 4 digits for Ethiopia, whatever case or spacing the country is typed in', () => {
    for (const country of ['Ethiopia', ' ethiopia ', 'ETHIOPIA']) {
      expect(check({ country, postalCode: '1000' }).postalCode).toBeUndefined();
    }
  });

  it('rejects anything but 4 digits for Ethiopia', () => {
    for (const postalCode of ['100', '12345', 'ABCD', '10 00', '1O00', '-100']) {
      expect(check({ postalCode }).postalCode).toEqual({ code: 'postalCodeEthiopia' });
    }
  });

  it('ignores whitespace around an Ethiopian code', () => {
    expect(check({ postalCode: ' 1000 ' }).postalCode).toBeUndefined();
  });

  it('requires a postal code', () => {
    expect(check({ postalCode: '' }).postalCode).toEqual({ code: 'required' });
  });

  it('accepts 3 to 10 digits for other countries', () => {
    for (const postalCode of ['100', '1000', '12345', '1234567890']) {
      expect(check({ country: 'Kenya', postalCode }).postalCode).toBeUndefined();
    }
  });

  it('rejects letters, separators and the wrong length for other countries', () => {
    for (const postalCode of ['12', '12345678901', 'SW1A 1AA', 'AB-1234', '-1000', '10#00', '10 00']) {
      expect(check({ country: 'Kenya', postalCode }).postalCode).toEqual({ code: 'postalCode' });
    }
  });
});

describe('digitsOnly', () => {
  it('drops everything but digits', () => {
    expect(digitsOnly('1a0-0 0')).toBe('1000');
    expect(digitsOnly('ABC')).toBe('');
    expect(digitsOnly('1000')).toBe('1000');
  });
});

describe('website', () => {
  it('is optional', () => {
    expect(check({ website: '' }).website).toBeUndefined();
  });

  it('accepts an address with or without a scheme', () => {
    for (const website of ['https://example.org', 'http://example.org/about', 'www.example.org', 'example.et']) {
      expect(check({ website }).website).toBeUndefined();
    }
  });

  it('rejects anything that is not a web address', () => {
    for (const website of ['not a website', 'localhost', 'ftp://example.org', 'javascript://x.y/%0Aalert(1)', 'a@b.c']) {
      expect(check({ website }).website).toEqual({ code: 'website' });
    }
  });
});

describe('normaliseWebsite', () => {
  it('adds https:// to a bare address and leaves a full one alone', () => {
    expect(normaliseWebsite(' example.org ')).toBe('https://example.org');
    expect(normaliseWebsite('http://example.org/a')).toBe('http://example.org/a');
  });

  it('is null for what is not a web address', () => {
    expect(normaliseWebsite('')).toBeNull();
    expect(normaliseWebsite('localhost')).toBeNull();
    expect(normaliseWebsite('mailto://a.b')).toBeNull();
  });
});

describe('contact details', () => {
  it('checks the work email', () => {
    expect(check({ email: 'not-an-email' }).email).toEqual({ code: 'email' });
    expect(check({ email: 'a@b.org' }).email).toBeUndefined();
  });

  it('applies the real Ethiopian mobile rule for +251', () => {
    expect(check({ phoneNumber: '911234567' }).phoneNumber).toBeUndefined();
    expect(check({ phoneNumber: '0711234567' }).phoneNumber).toBeUndefined();
    expect(check({ phoneNumber: '0211234567' }).phoneNumber).toEqual({ code: 'phoneEthiopia' });
    expect(check({ phoneNumber: '91123' }).phoneNumber).toEqual({ code: 'phoneEthiopia' });
  });

  it('applies only the loose check for another country, and re-judges when the dial code changes', () => {
    expect(check({ phoneCode: '+254', phoneNumber: '712345678' }).phoneNumber).toBeUndefined();
    expect(check({ phoneCode: '+254', phoneNumber: '12' }).phoneNumber).toEqual({ code: 'phone' });
    // Valid as an Ethiopian-style number, but the field now says +254 — still passes the loose rule.
    expect(validateOrganisationField('phoneNumber', { ...VALID, phoneCode: '+254' }, ENTITY_TYPES)).toBeNull();
  });
});
