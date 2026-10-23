"use client";

import { errorIdFor, FieldError, INVALID_INPUT_STYLES } from "@/components/ui/FieldError";
import { AnimatedSelect, type Option } from "./SI-Dropdown";
import { SIPhoneField } from "./SI-PhoneField";
import { SIMaskedIdField } from "./SIMaskedIdField";
import type { SIFormProps } from "./SI-types";

// The field controls every submitter-identity form is built from. Each wraps
// the label, the input, and the inline error for one field, so the five
// per-type forms are a list of fields rather than five copies of the same
// markup — and a validation rule or a11y fix lands in one place.

/** What each field needs from the form that renders it. */
export type SIFieldContext = Pick<SIFormProps, "values" | "setValue" | "errors" | "onFieldBlur">;

/** The DOM id for a field, which is also where "focus the first invalid field" looks. */
export function siFieldId(name: string): string {
  return `si-${name}`;
}

const INPUT_CLASS =
  "w-full bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0b8535]/20 focus:border-[#0b8535] text-sm transition-colors shadow-sm";

/** The id a field's hint gets, for the input's `aria-describedby` while no error replaces it. */
function hintIdFor(id: string): string {
  return `${id}-hint`;
}

interface FieldShellProps {
  name: string;
  label: React.ReactNode;
  required?: boolean;
  error: string | undefined;
  /** Helper text under the field, shown until an error takes its place. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** The label, control slot and inline error/hint around one field — for a form that needs a control the `SI*Field`s don't cover. */
export function FieldShell({ name, label, required, error, hint, className, children }: FieldShellProps) {
  const id = siFieldId(name);
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800 mb-2">
        {label}
        {required && (
          <>
            {" "}
            <span className="text-red-500">*</span>
          </>
        )}
      </label>
      {children}
      {error ? (
        <FieldError id={errorIdFor(id)}>{error}</FieldError>
      ) : (
        hint && (
          <p id={hintIdFor(id)} className="mt-1.5 text-[12px] font-medium text-gray-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface FieldProps extends SIFieldContext {
  name: string;
  label: React.ReactNode;
  required?: boolean;
  placeholder?: string;
  /** Helper text under the field, shown until an error takes its place. */
  hint?: string;
  className?: string;
}

/** A single-line text (or email) input. */
export function SITextField({
  values,
  setValue,
  errors,
  onFieldBlur,
  name,
  label,
  required,
  placeholder,
  hint,
  className,
  type = "text",
  maxLength,
  inputMode,
}: FieldProps & { type?: "text" | "email"; maxLength?: number; inputMode?: "numeric" }) {
  const id = siFieldId(name);
  const error = errors?.[name];
  return (
    <FieldShell name={name} label={label} required={required} error={error} hint={hint} className={className}>
      <input
        id={id}
        type={type}
        autoComplete="off"
        maxLength={maxLength}
        inputMode={inputMode}
        value={values[name] || ""}
        onChange={(e) => setValue(name, e.target.value)}
        onBlur={() => onFieldBlur?.(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorIdFor(id) : hint ? hintIdFor(id) : undefined}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${INVALID_INPUT_STYLES}`}
      />
    </FieldShell>
  );
}

/**
 * A pick-one dropdown (the searchable `AnimatedSelect`). It has no blur event,
 * so the choice is reported through `setValue` only — a caller that validates
 * on blur should also validate on change for this one.
 */
export function SISelectField({
  values,
  setValue,
  errors,
  name,
  label,
  required,
  placeholder = "",
  hint,
  className,
  options,
}: FieldProps & { options: Option[] }) {
  const id = siFieldId(name);
  const error = errors?.[name];
  return (
    <FieldShell name={name} label={label} required={required} error={error} hint={hint} className={className}>
      <AnimatedSelect
        id={id}
        options={options}
        placeholder={placeholder}
        value={values[name] || ""}
        onChange={(value) => setValue(name, value)}
        invalid={!!error}
        describedBy={error ? errorIdFor(id) : hint ? hintIdFor(id) : undefined}
      />
    </FieldShell>
  );
}

/** A national-ID input — masked, with a reveal toggle. */
export function SIIdField({ values, setValue, errors, onFieldBlur, name, label, required, placeholder, className }: FieldProps) {
  const id = siFieldId(name);
  const error = errors?.[name];
  return (
    <FieldShell name={name} label={label} required={required} error={error} className={className}>
      <SIMaskedIdField
        id={id}
        value={values[name] || ""}
        onChange={(value) => setValue(name, value)}
        onBlur={() => onFieldBlur?.(name)}
        invalid={!!error}
        describedBy={error ? errorIdFor(id) : undefined}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

/** The mobile number with its country-code picker. The number is stored under `name`, the code under `phoneCode`. */
export function SIPhoneFormField({
  values,
  setValue,
  errors,
  onFieldBlur,
  name = "phoneNumber",
  label,
  required,
  placeholder,
  className,
}: Omit<FieldProps, "name"> & { name?: string }) {
  const id = siFieldId(name);
  const error = errors?.[name];
  return (
    <FieldShell name={name} label={label} required={required} error={error} className={className}>
      <SIPhoneField
        id={id}
        countryCode={values.phoneCode || "+251"}
        setCountryCode={(code) => setValue("phoneCode", code)}
        phoneNumber={values[name] || ""}
        setPhoneNumber={(value) => setValue(name, value)}
        onBlur={() => onFieldBlur?.(name)}
        invalid={!!error}
        describedBy={error ? errorIdFor(id) : undefined}
        {...(placeholder ? { placeholder } : {})}
      />
    </FieldShell>
  );
}
