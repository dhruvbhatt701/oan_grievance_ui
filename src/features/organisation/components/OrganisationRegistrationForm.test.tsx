// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';

const registerOrganisation = vi.fn();
const getMyOrganisation = vi.fn();

vi.mock('../api/organisationApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/organisationApi')>()),
  registerOrganisation: (...args: unknown[]) => registerOrganisation(...args),
  getMyOrganisation: (...args: unknown[]) => getMyOrganisation(...args),
}));

// Two-level slice of the administrative-area tree, keyed by the parent's area_id.
const AREAS: Record<string, Array<[id: string, name: string]>> = {
  '': [['region-ET14', 'Addis Ababa'], ['region-ET04', 'Oromia']],
  'region-ET14': [['zone-ET1401', 'Arada Sub-city']],
  'region-ET04': [['zone-ET0401', 'East Shewa']],
  'zone-ET1401': [['woreda-ET140101', 'Woreda 01']],
  'woreda-ET140101': [['kebele-ET14010101', 'Kebele 01']],
};
const useAreas = vi.fn(({ parents = [] }: { level: string; parents?: readonly string[] }) => ({
  areas: (AREAS[parents[0] ?? ''] ?? []).map(([area_id, area_name]) => ({ area_id, area_name })),
  isLoading: false,
  isError: false,
  isTruncated: false,
}));

vi.mock('@/features/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/metadata')>()),
  useAreas: (...args: Parameters<typeof useAreas>) => useAreas(...args),
}));

import { ApiError } from '@/lib/api/fetchApi';
import type { OrganisationKind } from '@/lib/organisationKind';
import { buildInitialOrganisationValues } from '../lib/defaults';
import { OrganisationRegistrationForm } from './OrganisationRegistrationForm';

afterEach(cleanup);

function renderForm(kind: OrganisationKind = 'ngo') {
  const onRegistered = vi.fn();
  const onBackToSignIn = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OrganisationRegistrationForm
        kind={kind}
        initialValues={buildInitialOrganisationValues({ email: 'rep@greenhighlands.org' })}
        onRegistered={onRegistered}
        onBackToSignIn={onBackToSignIn}
      />
    </NextIntlClientProvider>
  );
  return { onRegistered, onBackToSignIn };
}

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const pick = (area: string) => fireEvent.click(screen.getByRole('option', { name: area }));

const registerButton = () => screen.getByRole('button', { name: /Register Organization/ });

function fillValidForm(entityType: string) {
  type(/^Organisation Name/, 'Green Highlands Development Association');
  fireEvent.click(screen.getByRole('option', { name: entityType }));
  type(/^Registration Number/, '0012345678');
  type(/^Authorised Representative/, 'Almaz Tesfaye');
  type(/^Street address/, 'Bole Road, Block 4');
  pick('Addis Ababa');
  pick('Arada Sub-city');
  type(/^Postal code/, '1000');
  type(/^Phone/, '0911234567');
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('OrganisationRegistrationForm', () => {
  beforeEach(() => {
    registerOrganisation.mockResolvedValue(undefined);
    getMyOrganisation.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it('lays out the three sections of the reference design', () => {
    renderForm();
    for (const heading of ['Organisation', 'Registered Address', 'Contact Details']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    for (const label of [
      /^Organisation Name/,
      /^Brand \/ display name/,
      /^Entity type/,
      /^Registration Number/,
      /^Authorised Representative/,
      /^Street address/,
      /^Kebele \/ Village/,
      /^Woreda/,
      /^Zone/,
      /^Region/,
      /^Country\s*\*/,
      /^Postal code/,
      /^Website/,
      /^Work email/,
      /^Phone/,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('shows Member Count Affected on the FPO screen only', () => {
    renderForm('fpo');
    expect(screen.getByLabelText(/^Member Count Affected/)).toBeInTheDocument();
    cleanup();

    renderForm('ngo');
    expect(screen.queryByLabelText(/^Member Count Affected/)).not.toBeInTheDocument();
  });

  it('starts the authorised representative as the account holder, editable', () => {
    const onRegistered = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OrganisationRegistrationForm
          kind="ngo"
          initialValues={buildInitialOrganisationValues({ email: 'rep@ngo.org', full_name: 'Almaz Tesfaye' })}
          onRegistered={onRegistered}
          onBackToSignIn={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    const rep = screen.getByLabelText(/^Authorised Representative/);
    expect(rep).toHaveValue('Almaz Tesfaye');
    fireEvent.change(rep, { target: { value: 'Someone Else' } });
    expect(rep).toHaveValue('Someone Else');
  });

  it('starts with Ethiopia, the +251 dial code and the signed-in email', () => {
    renderForm();
    expect(screen.getByLabelText(/^Country\s*\*/)).toHaveValue('Ethiopia');
    expect(screen.getByLabelText(/^Work email/)).toHaveValue('rep@greenhighlands.org');
    expect(screen.getByRole('button', { name: /Country code, Ethiopia \+251/ })).toBeInTheDocument();
  });

  it('keeps Register disabled until the consent is ticked', () => {
    renderForm();
    expect(registerButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(registerButton()).toBeEnabled();
  });

  it('reports every missing required field at once, focuses the first, and sends nothing', () => {
    renderForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(registerButton());

    expect(screen.getAllByText('This field is required.')).toHaveLength(9);
    expect(screen.getByLabelText(/^Organisation Name/)).toHaveFocus();
    expect(screen.getByLabelText(/^Organisation Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(registerOrganisation).not.toHaveBeenCalled();
  });

  it('checks a field when it loses focus and clears the message once it is fixed', () => {
    renderForm();
    const tax = screen.getByLabelText(/^Registration Number/);

    fireEvent.change(tax, { target: { value: '!!' } });
    fireEvent.blur(tax);
    expect(screen.getByText(/Use 3-60 letters or numbers/)).toBeInTheDocument();

    fireEvent.change(tax, { target: { value: '0012345678' } });
    expect(screen.queryByText(/Use 3-60 letters or numbers/)).not.toBeInTheDocument();
  });

  it('offers NGO entity types on the NGO screen and FPO ones on the FPO screen', () => {
    renderForm('ngo');
    expect(screen.getByRole('option', { name: 'Local NGO' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cooperative Union' })).not.toBeInTheDocument();
    cleanup();

    renderForm('fpo');
    expect(screen.getByRole('option', { name: 'Cooperative Union' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Local NGO' })).not.toBeInTheDocument();
  });

  describe('registered address areas', () => {
    it('lists Regions first and each narrower level only once the one above is chosen', () => {
      renderForm();
      const zone = () => screen.getByRole('combobox', { name: /^Zone/ });
      const woreda = () => screen.getByRole('combobox', { name: /^Woreda/ });
      const kebele = () => screen.getByRole('combobox', { name: /^Kebele/ });

      expect(screen.getByRole('option', { name: 'Oromia' })).toBeInTheDocument();
      expect(zone()).toBeDisabled();
      expect(woreda()).toBeDisabled();
      expect(kebele()).toBeDisabled();
      expect(useAreas).toHaveBeenCalledWith(expect.objectContaining({ level: 'Zone', parents: [] }));

      pick('Addis Ababa');
      expect(useAreas).toHaveBeenCalledWith({ level: 'Zone', parents: ['region-ET14'] });
      expect(zone()).toBeEnabled();
      expect(woreda()).toBeDisabled();

      pick('Arada Sub-city');
      expect(useAreas).toHaveBeenCalledWith({ level: 'Woreda', parents: ['zone-ET1401'] });
      pick('Woreda 01');
      expect(useAreas).toHaveBeenCalledWith({ level: 'Kebele', parents: ['woreda-ET140101'] });
      expect(kebele()).toBeEnabled();
    });

    it('sends the chosen names, and clears the narrower areas when a broader one changes', async () => {
      renderForm();
      fillValidForm('Local NGO');
      pick('Woreda 01');
      pick('Kebele 01');

      // Changing the Region drops the Zone, Woreda and Kebele picked under the old one.
      pick('Oromia');
      expect(screen.getByRole('combobox', { name: /^Zone/ })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: /^Woreda/ })).toBeDisabled();
      fireEvent.click(registerButton());
      expect(screen.getByText('This field is required.')).toBeInTheDocument();
      expect(registerOrganisation).not.toHaveBeenCalled();

      pick('East Shewa');
      fireEvent.click(registerButton());
      await waitFor(() => expect(registerOrganisation).toHaveBeenCalledTimes(1));
      const sent = registerOrganisation.mock.calls[0]![0];
      expect(sent).toMatchObject({ region: 'Oromia', zone: 'East Shewa' });
      expect(sent).not.toHaveProperty('woreda');
      expect(sent).not.toHaveProperty('kebele');
    });

    it('sends the Woreda and Kebele names when they are chosen', async () => {
      renderForm();
      fillValidForm('Local NGO');
      pick('Woreda 01');
      pick('Kebele 01');
      fireEvent.click(registerButton());

      await waitFor(() => expect(registerOrganisation).toHaveBeenCalledTimes(1));
      expect(registerOrganisation.mock.calls[0]![0]).toMatchObject({
        region: 'Addis Ababa',
        zone: 'Arada Sub-city',
        woreda: 'Woreda 01',
        kebele: 'Kebele 01',
      });
    });
  });

  it('asks for a 4-digit postal code in Ethiopia, and only a length-and-characters one elsewhere', () => {
    renderForm();
    const postal = screen.getByLabelText(/^Postal code/);
    const ethiopian = 'Ethiopian postal codes are exactly 4 digits, e.g. 1000.';

    fireEvent.change(postal, { target: { value: '12345' } });
    fireEvent.blur(postal);
    expect(screen.getByText(ethiopian)).toBeInTheDocument();

    // The rule follows the country: the same code is fine once it is not Ethiopia.
    type(/^Country\s*\*/, 'Kenya');
    expect(screen.queryByText(ethiopian)).not.toBeInTheDocument();

    type(/^Country\s*\*/, 'Ethiopia');
    fireEvent.blur(postal);
    expect(screen.getByText(ethiopian)).toBeInTheDocument();

    fireEvent.change(postal, { target: { value: '1000' } });
    expect(screen.queryByText(ethiopian)).not.toBeInTheDocument();
  });

  it('takes digits only in the postal code, dropping anything else as it is typed or pasted', () => {
    renderForm();
    const postal = screen.getByLabelText(/^Postal code/);
    expect(postal).toHaveAttribute('inputmode', 'numeric');

    fireEvent.change(postal, { target: { value: '1a0-0 0' } });
    expect(postal).toHaveValue('1000');
    fireEvent.change(postal, { target: { value: 'ABC' } });
    expect(postal).toHaveValue('');
  });

  it('registers an NGO with the backend contract and hands back the record it answers with', async () => {
    registerOrganisation.mockResolvedValue({
      id: 'ORG-0001',
      legalName: 'Green Highlands Development Association',
      brandName: null,
      orgType: 'NGO',
      entityType: 'Local NGO',
      registrationNumber: 'ET12345678',
      status: 'In Review',
      statusReason: null,
    });
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    expect(registerOrganisation).toHaveBeenCalledWith({
      legal_name: 'Green Highlands Development Association',
      org_type: 'NGO',
      entity_type: 'Local NGO',
      registration_number: '0012345678',
      representative_name: 'Almaz Tesfaye',
      street_address: 'Bole Road, Block 4',
      zone: 'Arada Sub-city',
      region: 'Addis Ababa',
      country: 'Ethiopia',
      postal_code: '1000',
      contact_email: 'rep@greenhighlands.org',
      contact_phone: '+251911234567',
      // The ticked consent box — the backend refuses the registration without it.
      consent_given: true,
    });
    expect(getMyOrganisation).not.toHaveBeenCalled();
    expect(onRegistered.mock.calls[0]![0]).toMatchObject({ id: 'ORG-0001', status: 'In Review' });
  });

  it('registers an FPO as org_type FPO, with its member count as a number', async () => {
    renderForm('fpo');
    fillValidForm('Primary Cooperative');
    type(/^Member Count Affected/, '120');
    fireEvent.click(registerButton());

    await waitFor(() => expect(registerOrganisation).toHaveBeenCalledTimes(1));
    expect(registerOrganisation.mock.calls[0]![0]).toMatchObject({
      org_type: 'FPO',
      entity_type: 'Primary Cooperative',
      representative_name: 'Almaz Tesfaye',
      members_affected: 120,
    });
  });

  it('leaves the member count out when an FPO gives none, and rejects one that is not a whole number', async () => {
    renderForm('fpo');
    fillValidForm('Primary Cooperative');
    type(/^Member Count Affected/, '12.5');
    fireEvent.click(registerButton());
    expect(screen.getByText('Enter a whole number of members, e.g. 120.')).toBeInTheDocument();
    expect(registerOrganisation).not.toHaveBeenCalled();

    type(/^Member Count Affected/, '');
    fireEvent.click(registerButton());
    await waitFor(() => expect(registerOrganisation).toHaveBeenCalledTimes(1));
    expect(registerOrganisation.mock.calls[0]![0]).not.toHaveProperty('members_affected');
  });

  it('never sends a member count for an NGO', async () => {
    renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    await waitFor(() => expect(registerOrganisation).toHaveBeenCalledTimes(1));
    expect(registerOrganisation.mock.calls[0]![0]).not.toHaveProperty('members_affected');
  });

  it('still shows the organisation as In Review if the backend answers with nothing readable', async () => {
    registerOrganisation.mockResolvedValue(null);
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    expect(onRegistered.mock.calls[0]![0]).toMatchObject({
      legalName: 'Green Highlands Development Association',
      orgType: 'NGO',
      status: 'In Review',
    });
  });

  it('puts a backend rule broken on one field under that field, in plain words, and keeps what was typed', async () => {
    registerOrganisation.mockRejectedValue(
      new ApiError('Validation failed', { code: 'VALIDATION_ERROR', details: { postal_code: 'Value error, Postal code is not valid.' } }, 400)
    );
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    expect(await screen.findByText('Postal code is not valid.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Postal code/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Postal code/)).toHaveFocus();
    expect(onRegistered).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Organisation Name/)).toHaveValue('Green Highlands Development Association');
    expect(registerButton()).toBeEnabled();
  });

  it('shows a rule only the backend can check (no field named) as an alert', async () => {
    registerOrganisation.mockRejectedValue(
      new ApiError('Entity type "Cooperative Union" is not valid for an NGO.', { details: {} }, 400)
    );
    renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Entity type "Cooperative Union" is not valid for an NGO.');
  });

  const EXISTING = {
    id: 'ORG-0001',
    legalName: 'Green Highlands Development Association',
    brandName: null,
    orgType: 'NGO',
    entityType: 'Local NGO',
    registrationNumber: 'ET12345678',
    status: 'In Review',
    statusReason: null,
  };

  // The backend's own messages: a 400 with no details, the message is all there is to go on.
  it('shows the organisation that already exists if the account has registered one ("Representative Account must be unique")', async () => {
    registerOrganisation.mockRejectedValue(
      new ApiError('Representative Account must be unique', { code: 'VALIDATION_ERROR', details: {} }, 400)
    );
    getMyOrganisation.mockResolvedValue(EXISTING);
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(EXISTING));
  });

  it('says so under the number when it is already taken ("Registration Number must be unique"), and does not look for an organisation of its own', async () => {
    registerOrganisation.mockRejectedValue(
      new ApiError('Registration Number must be unique', { code: 'VALIDATION_ERROR', details: {} }, 400)
    );
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    expect(await screen.findByText('An organisation with this registration number is already registered.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Registration Number/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Registration Number/)).toHaveFocus();
    expect(onRegistered).not.toHaveBeenCalled();
    expect(getMyOrganisation).not.toHaveBeenCalled();
  });

  it('shows the message instead if the account supposedly has an organisation but none can be found', async () => {
    registerOrganisation.mockRejectedValue(
      new ApiError('Representative Account must be unique', { code: 'VALIDATION_ERROR', details: {} }, 400)
    );
    getMyOrganisation.mockResolvedValue(null);
    const { onRegistered } = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Representative Account must be unique');
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('still understands the older 409 for either case', async () => {
    registerOrganisation.mockRejectedValue(new ApiError('Already registered.', { code: 'DUPLICATE_ENTRY' }, 409));
    getMyOrganisation.mockResolvedValueOnce(EXISTING);
    const first = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());
    await waitFor(() => expect(first.onRegistered).toHaveBeenCalledWith(EXISTING));
    cleanup();

    getMyOrganisation.mockResolvedValueOnce(null);
    const second = renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());
    expect(await screen.findByText('An organisation with this registration number is already registered.')).toBeInTheDocument();
    expect(second.onRegistered).not.toHaveBeenCalled();
  });
  it.each([
    ['FORBIDDEN', 'Your account is not permitted to register an organisation.'],
    ['CONNECTION', 'We could not reach the server. Please try again in a moment.'],
  ])('turns the bare %s sentinel into a readable alert', async (sentinel, message) => {
    registerOrganisation.mockRejectedValue(new Error(sentinel));
    renderForm('ngo');
    fillValidForm('Local NGO');
    fireEvent.click(registerButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(sentinel)).not.toBeInTheDocument();
  });

  it('sends Back to the sign-in handler', () => {
    const { onBackToSignIn } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
    expect(onBackToSignIn).toHaveBeenCalledTimes(1);
  });
});
