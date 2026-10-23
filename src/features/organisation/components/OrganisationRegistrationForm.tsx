'use client';

import { SIPhoneFormField, SISelectField, SITextField, siFieldId } from '@/components/submitter-identity/SI-fields';
import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { extractFieldErrors } from '@/lib/api/fetchApi';
import type { OrganisationKind } from '@/lib/organisationKind';
import { focusFirstError, useFieldErrors, type FieldErrors } from '@/lib/validation/useFieldErrors';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BACKEND_FIELD_TO_FORM_FIELD,
  cleanBackendMessage,
  duplicateRegistrationOf,
  getMyOrganisation,
  registerOrganisation,
  toRegistrationPayload,
  type Organisation,
} from '../api/organisationApi';
import { ORGANISATION_CONFIG } from '../config';
import {
  digitsOnly,
  ORGANISATION_FIELDS,
  POSTAL_CODE_MAX_LENGTH,
  validateOrganisation,
  validateOrganisationField,
  type OrganisationField,
  type OrganisationProblem,
  type OrganisationValues,
} from '../lib/validation';
import { backendMessageOf, knownFailureOf } from '../lib/errors';
import { OrganisationAreaFields, type AreaPatch } from './OrganisationAreaFields';

export interface OrganisationRegistrationFormProps {
  kind: OrganisationKind;
  /** The form's starting values — see `buildInitialOrganisationValues`. */
  initialValues: OrganisationValues;
  onRegistered: (organisation: Organisation) => void;
  onBackToSignIn: () => void;
}

const FIELD_ORDER = ORGANISATION_FIELDS.map((key) => ({ key, id: siFieldId(key) }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <h2 className="px-6 py-4 border-b border-gray-100 bg-gray-50/70 rounded-t-2xl text-[15px] font-bold text-gray-900">
        {title}
      </h2>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">{children}</div>
    </section>
  );
}

/**
 * The "Register your organisation" form — the three cards of the reference
 * design (Organisation, Registered Address, Contact Details) and the consent
 * that gates the Register button. Shared by the NGO and FPO screens; `kind`
 * picks the organisation type it registers as and the entity types offered.
 */
export function OrganisationRegistrationForm({
  kind,
  initialValues,
  onRegistered,
  onBackToSignIn,
}: OrganisationRegistrationFormProps) {
  const t = useTranslations('organisation');
  const config = ORGANISATION_CONFIG[kind];
  const entityTypeValues = config.entityTypes.map((entityType) => entityType.value);
  const entityTypeOptions = config.entityTypes.map((entityType) => ({
    value: entityType.value,
    label: t(`entityTypes.${entityType.labelKey}`),
  }));

  const [values, setValues] = useState<OrganisationValues>(initialValues);
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A problem with the registration as a whole (service down, a rule only the
  // backend knows). Problems with one field go under that field instead.
  const [formError, setFormError] = useState<string | null>(null);
  const fieldErrors = useFieldErrors<OrganisationField>();

  const messageFor = (problem: OrganisationProblem | null): string | null => {
    if (!problem) return null;
    return problem.code === 'tooLong' ? t('errors.tooLong', { max: problem.max }) : t(`errors.${problem.code}`);
  };

  const checkField = (field: OrganisationField, next: OrganisationValues = values) => {
    fieldErrors.setError(field, messageFor(validateOrganisationField(field, next, entityTypeValues)));
  };

  // A field already showing an error is re-checked as it is edited, so the
  // message goes away the moment it is fixed. The dial code is not a field of
  // its own, but it changes what a valid phone number is, so a phone error
  // already showing is re-judged against the newly chosen country. The
  // entity-type dropdown has no blur event, so it is checked on every change.
  const setValue = (key: string, typed: string) => {
    // The postal code is digits only: anything else is dropped as it is typed or pasted.
    const value = key === 'postalCode' ? digitsOnly(typed) : typed;
    const next = { ...values, [key]: value };
    setValues(next);
    if (key === 'phoneCode') {
      if (fieldErrors.errors.phoneNumber) checkField('phoneNumber', next);
    } else if (key === 'country') {
      // Ethiopia has its own 4-digit postal code rule, so a postal-code error already showing is re-judged against the new country.
      if (fieldErrors.errors.postalCode) checkField('postalCode', next);
      if (fieldErrors.errors.country) checkField('country', next);
    } else if (key === 'entityType' || fieldErrors.errors[key as OrganisationField]) {
      checkField(key as OrganisationField, next);
    }
  };

  // Choosing a Region/Zone/Woreda/Kebele also clears the narrower ones, so the
  // names are applied as one change — separate `setValue`s would each start
  // from the same stale `values` and the last would win.
  const setAreaValues = (patch: AreaPatch) => {
    const next = { ...values, ...patch };
    setValues(next);
    for (const key of Object.keys(patch) as Array<keyof AreaPatch>) {
      if (fieldErrors.errors[key]) checkField(key, next);
    }
  };

  const handleBlur = (key: string) => checkField(key as OrganisationField);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const problems = validateOrganisation(values, entityTypeValues);
    const messages: FieldErrors<OrganisationField> = {};
    for (const field of ORGANISATION_FIELDS) {
      const message = messageFor(problems[field] ?? null);
      if (message) messages[field] = message;
    }
    fieldErrors.setAll(messages);
    if (Object.keys(messages).length > 0) {
      focusFirstError(FIELD_ORDER, messages);
      return;
    }
    // The button is disabled without consent, but Enter in a field submits the form regardless.
    if (!consent) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const registered = await registerOrganisation(toRegistrationPayload(kind, values));
      // The backend answers with the record, In Review. If it somehow answered
      // with nothing readable the registration still went through, so show
      // what was just submitted as In Review rather than an error.
      onRegistered(
        registered ?? {
          id: null,
          legalName: values.legalName.trim(),
          brandName: values.brandName.trim() || null,
          orgType: config.backendOrgType,
          entityType: values.entityType,
          registrationNumber: values.taxId.trim().toUpperCase(),
          status: 'In Review',
          statusReason: null,
        }
      );
    } catch (error) {
      await showFailure(error);
      setIsSubmitting(false);
    }
  };

  /**
   * Puts a failed registration where the person can act on it: a field's own
   * message under that field, otherwise one alert for the form.
   */
  const showFailure = async (error: unknown) => {
    // "Already registered": either this account already has an organisation (a second tab,
    // a double submit) — then just show it — or the registration number is taken.
    const duplicate = duplicateRegistrationOf(error);
    if (duplicate) {
      if (duplicate !== 'number') {
        const existing = await getMyOrganisation().catch(() => null);
        if (existing) {
          onRegistered(existing);
          return;
        }
      }
      if (duplicate === 'account') {
        setFormError(backendMessageOf(error) ?? t('errors.generic'));
        return;
      }
      const taken = { taxId: t('errors.registrationNumberTaken') };
      fieldErrors.setAll(taken);
      focusFirstError(FIELD_ORDER, taken);
      return;
    }

    // 400 with `details`: per-field messages go under the matching input.
    const fromBackend: FieldErrors<OrganisationField> = {};
    for (const [backendField, message] of Object.entries(extractFieldErrors(error))) {
      const field = BACKEND_FIELD_TO_FORM_FIELD[backendField];
      if (field) fromBackend[field] = cleanBackendMessage(message);
    }
    if (Object.keys(fromBackend).length > 0) {
      fieldErrors.setAll(fromBackend);
      focusFirstError(FIELD_ORDER, fromBackend);
      return;
    }

    // Anything else: 403 / 5xx / network arrive as bare sentinels from fetchApi, and
    // rules that need the database (phone number, entity type for the org type) as a message.
    const known = knownFailureOf(error);
    setFormError(known ? t(`errors.${known}`) : (backendMessageOf(error) ?? t('errors.generic')));
  };

  // `errors` is a Partial map; the shared field components read it by key and treat a missing key as "no error".
  const shownErrors = fieldErrors.errors as Record<string, string>;
  const field = { values, setValue, errors: shownErrors, onFieldBlur: handleBlur };

  return (
    // noValidate: the browser's own required/email bubbles would pre-empt the inline messages.
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && <ErrorAlert>{formError}</ErrorAlert>}

      <Section title={t('sections.organisation')}>
        <SITextField
          {...field}
          name="legalName"
          label={t('fields.legalName.label')}
          placeholder={t('fields.legalName.placeholder')}
          required
          className="md:col-span-2"
        />
        <SITextField
          {...field}
          name="brandName"
          label={t('fields.brandName.label')}
          placeholder={t('fields.brandName.placeholder')}
          hint={t('fields.brandName.hint')}
        />
        <SISelectField
          {...field}
          name="entityType"
          label={t('fields.entityType.label')}
          placeholder={t('fields.entityType.placeholder')}
          options={entityTypeOptions}
          required
        />
        <SITextField
          {...field}
          name="taxId"
          label={t('fields.taxId.label')}
          placeholder={t('fields.taxId.placeholder')}
          hint={t('fields.taxId.hint')}
          maxLength={60}
          required
        />
        <SITextField
          {...field}
          name="representativeName"
          label={t('fields.representativeName.label')}
          placeholder={t('fields.representativeName.placeholder')}
          required
        />
        {kind === 'fpo' && (
          <SITextField
            {...field}
            name="memberCount"
            label={t('fields.memberCount.label')}
            placeholder={t('fields.memberCount.placeholder')}
            maxLength={9}
          />
        )}
      </Section>

      <Section title={t('sections.address')}>
        <SITextField
          {...field}
          name="streetAddress"
          label={t('fields.streetAddress.label')}
          placeholder={t('fields.streetAddress.placeholder')}
          required
          className="md:col-span-2"
        />
        <OrganisationAreaFields errors={shownErrors} onChange={setAreaValues} />
        <SITextField
          {...field}
          name="country"
          label={t('fields.country.label')}
          placeholder={t('fields.country.placeholder')}
          required
        />
        <SITextField
          {...field}
          name="postalCode"
          label={t('fields.postalCode.label')}
          placeholder={t('fields.postalCode.placeholder')}
          inputMode="numeric"
          maxLength={POSTAL_CODE_MAX_LENGTH}
          required
        />
        <SITextField
          {...field}
          name="website"
          label={t('fields.website.label')}
          placeholder={t('fields.website.placeholder')}
          hint={t('fields.website.hint')}
        />
      </Section>

      <Section title={t('sections.contact')}>
        <SITextField
          {...field}
          name="email"
          type="email"
          label={t('fields.email.label')}
          placeholder={t('fields.email.placeholder')}
          hint={t('fields.email.hint')}
          required
        />
        <SIPhoneFormField
          {...field}
          label={t('fields.phone.label')}
          placeholder={t('fields.phone.placeholder')}
          required
        />

        <label className="md:col-span-2 flex items-start gap-3 cursor-pointer group mt-1">
          <span className="relative mt-0.5 shrink-0">
            <span
              className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-300 border-2 group-focus-within:ring-2 group-focus-within:ring-[#16A34A]/30 ${
                consent ? 'bg-[#16A34A] border-[#16A34A]' : 'border-gray-300 bg-white group-hover:border-[#16A34A]'
              }`}
            >
              <Check
                className={`w-3.5 h-3.5 text-white transition-all duration-300 ${consent ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                strokeWidth={4}
              />
            </span>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="sr-only"
            />
          </span>
          <span className="text-[14px] font-medium text-gray-600 leading-relaxed select-none">
            {t.rich('consent', {
              policy: (chunks) => <strong className="font-bold text-gray-700">{chunks}</strong>,
              agreement: (chunks) => <strong className="font-bold text-gray-700">{chunks}</strong>,
            })}
          </span>
        </label>
      </Section>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToSignIn}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-[12px] border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t('actions.back')}
        </button>
        <Button type="submit" isLoading={isSubmitting} disabled={!consent} className="px-6 gap-2">
          {t('actions.register')}
          {!isSubmitting && <ArrowRight size={16} aria-hidden="true" />}
        </Button>
      </div>
    </form>
  );
}
