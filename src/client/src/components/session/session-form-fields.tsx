import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { RequiredMarker } from '@/components/ui/required-marker';
import { StartsAtPicker } from './starts-at-picker';
import { VenuePicker } from '@/components/venue/venue-picker';
import type { SessionType, SessionFormat, SessionVisibility, ShuttlePolicy } from '@pavilion/types';
import {
  SESSION_TYPE_LABELS,
  SESSION_FORMAT_LABELS,
  SESSION_VISIBILITY_LABELS,
  SHUTTLE_POLICY_LABELS,
  MIN_SKILL_INPUT,
  MAX_SKILL_INPUT,
  defaultStartsAtLocal,
} from '@/lib/session-format';
import { fieldClassName, labelClassName } from './field-styles';

// Number/datetime inputs are kept as strings here and parsed by the caller on
// submit — avoids NaN churn while the user is mid-edit of a numeric field.
export interface SessionFormValues {
  // Empty string means no real venue is associated -- an "unofficial venue"
  // per brainstorm.md, where the organizer posts the venue name directly and
  // no venue listing is needed. Only ever set in 'create' mode via
  // VenuePicker below; SessionUpdateFields excludes venueId server-side, so
  // 'edit' mode never touches it (see session-form-fields.tsx's mode prop).
  venueId: string;
  venueName: string;
  type: SessionType;
  format: SessionFormat;
  visibility: SessionVisibility;
  skillMin: string;
  skillMax: string;
  courtCount: string;
  maxPlayers: string;
  startsAt: string;
  durationMinutes: string;
  shuttlePolicy: ShuttlePolicy;
  shuttleTubePrice: string;
  notes: string;
}

// Context-aware starting point for a new session rather than a blank form:
// 3.0-5.0 is brainstorm.md's own worked example under "Session skill range
// enforcement" ("Organizer sets the skill range for a session, e.g., 3.0-5.0")
// — a typical recreational-to-intermediate placement gap. Court/player/
// duration defaults match a standard single-court casual session; startsAt
// defaults to tomorrow evening (see defaultStartsAtLocal) rather than empty.
export function emptySessionFormValues(): SessionFormValues {
  return {
    venueId: '',
    venueName: '',
    type: 'drop_in',
    format: 'casual_rotation',
    visibility: 'public',
    skillMin: '3.0',
    skillMax: '5.0',
    courtCount: '1',
    maxPlayers: '8',
    startsAt: defaultStartsAtLocal(),
    durationMinutes: '60',
    shuttlePolicy: 'bring_your_own',
    shuttleTubePrice: '',
    notes: '',
  };
}

const TYPE_OPTIONS: { id: SessionType; label: string }[] = [
  { id: 'drop_in', label: SESSION_TYPE_LABELS.drop_in },
  { id: 'organizer_hosted', label: SESSION_TYPE_LABELS.organizer_hosted },
];

const FORMAT_OPTIONS: { id: SessionFormat; label: string }[] = [
  { id: 'casual_rotation', label: SESSION_FORMAT_LABELS.casual_rotation },
  { id: 'king_of_the_court', label: SESSION_FORMAT_LABELS.king_of_the_court },
  { id: 'round_robin', label: SESSION_FORMAT_LABELS.round_robin },
];

const VISIBILITY_OPTIONS: { id: SessionVisibility; label: string }[] = [
  { id: 'public', label: SESSION_VISIBILITY_LABELS.public },
  { id: 'invite_only', label: SESSION_VISIBILITY_LABELS.invite_only },
];

const SHUTTLE_POLICY_OPTIONS: { id: ShuttlePolicy; label: string }[] = [
  { id: 'bring_your_own', label: SHUTTLE_POLICY_LABELS.bring_your_own },
  { id: 'split_cost', label: SHUTTLE_POLICY_LABELS.split_cost },
  { id: 'provided', label: SHUTTLE_POLICY_LABELS.provided },
];

const sectionHeadingClassName = 'text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500';

interface SessionFormFieldsProps {
  mode: 'create' | 'edit';
  values: SessionFormValues;
  onChange: (patch: Partial<SessionFormValues>) => void;
  // Only needed for the create-mode VenuePicker's venue search calls --
  // 'edit' mode's callers may pass it too, since it's unused there.
  accessToken: string;
}

// Shared field set for /sessions/new and the inline edit form on
// /sessions/[id] — SessionUpdateFields (server) is SessionCreateFields minus
// `type`/`venueId`/`isRecurring`/`recurringCronExpr`, so edit mode just hides
// the `type` selector rather than needing a separate component. Text/number/
// date inputs use the same underline (not boxed) style as the Browse filter
// bar (field-styles.ts) — RadioGroup stays as-is, since a row of circular
// radio buttons was never a "boxy card" to begin with.
//
// Layout: every RadioGroup-based (categorical) field is grouped into one
// "Session details" section up top; every numeric/text/date field follows in
// a "Logistics" section below — a deliberate split, not an incidental one,
// so all the multiple-choice taps happen before any typing/scrolling starts.
export function SessionFormFields({ mode, values, onChange, accessToken }: SessionFormFieldsProps) {
  return (
    <div className="space-y-8">
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        <RequiredMarker /> indicates a required field
      </p>

      <div className="space-y-6">
        <p className={sectionHeadingClassName}>Session details</p>

        {mode === 'create' && (
          <div className="space-y-2">
            <Label>
              Session type
              <RequiredMarker />
            </Label>
            <RadioGroup
              value={values.type}
              onValueChange={(value) => onChange({ type: value as SessionType })}
              className="gap-3"
            >
              {TYPE_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} id={`type-${option.id}`} />
                  <Label htmlFor={`type-${option.id}`} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        <div className="space-y-2">
          <Label>
            Format
            <RequiredMarker />
          </Label>
          <RadioGroup
            value={values.format}
            onValueChange={(value) => onChange({ format: value as SessionFormat })}
            className="gap-3"
          >
            {FORMAT_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-center gap-3">
                <RadioGroupItem value={option.id} id={`format-${option.id}`} />
                <Label htmlFor={`format-${option.id}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>
            Visibility
            <RequiredMarker />
          </Label>
          <RadioGroup
            value={values.visibility}
            onValueChange={(value) => onChange({ visibility: value as SessionVisibility })}
            className="gap-3"
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-center gap-3">
                <RadioGroupItem value={option.id} id={`visibility-${option.id}`} />
                <Label htmlFor={`visibility-${option.id}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>
            Shuttle policy
            <RequiredMarker />
          </Label>
          <RadioGroup
            value={values.shuttlePolicy}
            onValueChange={(value) => onChange({ shuttlePolicy: value as ShuttlePolicy })}
            className="gap-3"
          >
            {SHUTTLE_POLICY_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-center gap-3">
                <RadioGroupItem value={option.id} id={`shuttle-${option.id}`} />
                <Label htmlFor={`shuttle-${option.id}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="space-y-6">
        <p className={sectionHeadingClassName}>Logistics</p>

        <div>
          <label htmlFor="venueName" className={labelClassName}>
            Venue name
            <RequiredMarker />
          </label>
          {mode === 'create' ? (
            <VenuePicker
              accessToken={accessToken}
              allowFreeText
              id="venueName"
              placeholder="Search venues, or type your own"
              required
              className={fieldClassName}
              value={{ venueId: values.venueId || null, venueName: values.venueName }}
              onChange={({ venueId, venueName }) => onChange({ venueId: venueId ?? '', venueName })}
              // Moves focus straight to Skill min once a venue is picked from
              // the dropdown -- the next field in the Logistics section (see
              // venue-address-autocomplete.tsx for the same "advance focus on
              // pick" pattern in the admin venue form).
              onSelect={() => document.getElementById('skillMin')?.focus()}
            />
          ) : (
            <input
              id="venueName"
              type="text"
              required
              placeholder="e.g. Riverside Community Center"
              value={values.venueName}
              onChange={(e) => onChange({ venueName: e.target.value })}
              className={fieldClassName}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="skillMin" className={labelClassName}>
              Skill min
              <RequiredMarker />
            </label>
            <input
              id="skillMin"
              type="number"
              step="0.25"
              min={MIN_SKILL_INPUT}
              max={MAX_SKILL_INPUT}
              required
              value={values.skillMin}
              onChange={(e) => onChange({ skillMin: e.target.value })}
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="skillMax" className={labelClassName}>
              Skill max
              <RequiredMarker />
            </label>
            <input
              id="skillMax"
              type="number"
              step="0.25"
              min={MIN_SKILL_INPUT}
              max={MAX_SKILL_INPUT}
              required
              value={values.skillMax}
              onChange={(e) => onChange({ skillMax: e.target.value })}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="courtCount" className={labelClassName}>
              Court count
              <RequiredMarker />
            </label>
            <input
              id="courtCount"
              type="number"
              min="1"
              required
              value={values.courtCount}
              onChange={(e) => onChange({ courtCount: e.target.value })}
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="maxPlayers" className={labelClassName}>
              Max players
              <RequiredMarker />
            </label>
            <input
              id="maxPlayers"
              type="number"
              min="1"
              required
              value={values.maxPlayers}
              onChange={(e) => onChange({ maxPlayers: e.target.value })}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StartsAtPicker value={values.startsAt} onChange={(startsAt) => onChange({ startsAt })} />
          <div>
            <label htmlFor="durationMinutes" className={labelClassName}>
              Duration (min)
              <RequiredMarker />
            </label>
            <input
              id="durationMinutes"
              type="number"
              min="1"
              required
              value={values.durationMinutes}
              onChange={(e) => onChange({ durationMinutes: e.target.value })}
              className={fieldClassName}
            />
          </div>
        </div>

        {values.shuttlePolicy !== 'bring_your_own' && (
          <div>
            <label htmlFor="shuttleTubePrice" className={labelClassName}>
              Tube price ($, optional)
            </label>
            <input
              id="shuttleTubePrice"
              type="number"
              min="0"
              step="0.01"
              value={values.shuttleTubePrice}
              onChange={(e) => onChange({ shuttleTubePrice: e.target.value })}
              className={fieldClassName}
            />
          </div>
        )}

        <div>
          <label htmlFor="notes" className={labelClassName}>
            Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            placeholder="Anything attendees should know — parking, what to bring, etc."
            value={values.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            className={fieldClassName}
          />
        </div>
      </div>
    </div>
  );
}
