'use client';

import { AnimatedSelect } from '@/components/submitter-identity/SI-Dropdown';
import { FieldShell, siFieldId } from '@/components/submitter-identity/SI-fields';
import { errorIdFor } from '@/components/ui/FieldError';
import { toAreaRef, useAreas, type AdministrativeArea, type AreaRef } from '@/features/metadata';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type AreaField = 'region' | 'zone' | 'woreda' | 'kebele';

/** The names to put in the form's values: a new selection, plus every narrower field it clears. */
export type AreaPatch = Partial<Record<AreaField, string>>;

interface OrganisationAreaFieldsProps {
  errors: Record<string, string>;
  /** Called with the new area names (`''` for a cleared field). Region, Zone, Woreda, Kebele are one change, so the form applies them together. */
  onChange: (patch: AreaPatch) => void;
}

type Selection = Record<AreaField, AreaRef | null>;

const NO_SELECTION: Selection = { region: null, zone: null, woreda: null, kebele: null };

/** Top-down, so each field's `narrower` are the ones after it. */
const AREA_FIELDS: readonly AreaField[] = ['region', 'zone', 'woreda', 'kebele'];

const REQUIRED: Record<AreaField, boolean> = { region: true, zone: true, woreda: false, kebele: false };

const PARENT_OF: Record<Exclude<AreaField, 'region'>, AreaField> = { zone: 'region', woreda: 'zone', kebele: 'woreda' };

function toOptions(areas: AdministrativeArea[]): Array<{ value: string; label: string }> {
  return areas.map((area) => ({ value: area.area_id, label: area.area_name }));
}

/**
 * The Region → Zone → Woreda → Kebele dropdowns of the registered address.
 * Each lists the areas under the one chosen above it (`GET
 * /api/v1/administrative-areas?parent=…&level_name=…`, via `useAreas`, the same
 * as Submit Grievance's location fields), and changing one clears the ones
 * below it. The form keeps the chosen areas' names — what `POST /orgs` takes —
 * while the area ids needed to ask for the next level down stay here.
 *
 * Renders four grid cells: place it directly inside the address section.
 */
export function OrganisationAreaFields({ errors, onChange }: OrganisationAreaFieldsProps) {
  const t = useTranslations('organisation');
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);

  const lists = {
    region: useAreas({ level: 'Region' }),
    zone: useAreas({ level: 'Zone', parents: selection.region ? [selection.region.id] : [] }),
    woreda: useAreas({ level: 'Woreda', parents: selection.zone ? [selection.zone.id] : [] }),
    kebele: useAreas({ level: 'Kebele', parents: selection.woreda ? [selection.woreda.id] : [] }),
  };

  const choose = (field: AreaField, areaId: string) => {
    const chosen = lists[field].areas.find((area) => area.area_id === areaId);
    const next = { ...selection, [field]: chosen ? toAreaRef(chosen) : null };
    const patch: AreaPatch = { [field]: chosen?.area_name ?? '' };
    // A narrower area belongs to the old parent, so it can no longer be right.
    for (const narrower of AREA_FIELDS.slice(AREA_FIELDS.indexOf(field) + 1)) {
      next[narrower] = null;
      patch[narrower] = '';
    }
    setSelection(next);
    onChange(patch);
  };

  const placeholderFor = (field: AreaField): string => {
    const list = lists[field];
    if (field !== 'region' && !selection[PARENT_OF[field]]) return t(`areas.select${capitalise(PARENT_OF[field])}First`);
    if (list.isLoading) return t('areas.loading');
    if (list.areas.length === 0 && !list.isError) return t('areas.none');
    return t(`fields.${field}.placeholder`);
  };

  return (
    <>
      {AREA_FIELDS.map((field) => {
        const id = siFieldId(field);
        const error = errors[field];
        const parent = field === 'region' ? null : selection[PARENT_OF[field]];
        return (
          <FieldShell
            key={field}
            name={field}
            label={t(`fields.${field}.label`)}
            required={REQUIRED[field]}
            error={error}
            hint={lists[field].isError ? t('areas.loadFailed') : undefined}
          >
            <AnimatedSelect
              id={id}
              options={toOptions(lists[field].areas)}
              placeholder={placeholderFor(field)}
              value={selection[field]?.id ?? ''}
              onChange={(areaId) => choose(field, areaId)}
              disabled={(field !== 'region' && !parent) || lists[field].isLoading}
              invalid={!!error}
              describedBy={error ? errorIdFor(id) : undefined}
            />
          </FieldShell>
        );
      })}
    </>
  );
}

function capitalise(field: AreaField): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}
