/** Accessible form fields for Preact islands (label, hint, error wired with aria-describedby). */
import type { ComponentChildren } from 'preact';
import { controlClass } from '@/components/ui/control';

interface BaseProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  optional?: boolean;
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

export function Field({ id, label, hint, error, optional, children }: BaseProps & { children: ComponentChildren }) {
  return (
    <div class="flex flex-col gap-1.5">
      <label for={id} class="text-sm font-medium text-ink">
        {label}
        {optional && <span class="font-normal text-ink-muted"> (opcional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} class="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} class="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = BaseProps & {
  value: string;
  onInput: (v: string) => void;
  type?: string;
  autocomplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  maxLength?: number;
  multiline?: boolean;
};

export function TextField(props: InputProps) {
  const {
    id,
    value,
    onInput,
    type = 'text',
    autocomplete,
    inputMode,
    maxLength,
    multiline,
    hint,
    error,
    optional,
  } = props;
  const common = {
    id,
    name: id,
    value,
    maxLength,
    required: !optional,
    'aria-invalid': error ? ('true' as const) : undefined,
    'aria-describedby': describedBy(id, hint, error),
    class: controlClass,
  };
  return (
    <Field {...props}>
      {multiline ? (
        <textarea {...common} rows={4} onInput={(e) => onInput(e.currentTarget.value)} />
      ) : (
        <input
          {...common}
          type={type}
          autocomplete={autocomplete}
          inputMode={inputMode}
          onInput={(e) => onInput(e.currentTarget.value)}
        />
      )}
    </Field>
  );
}

type SelectProps = BaseProps & {
  value: string;
  onChange: (v: string) => void;
  groups: { label: string; options: readonly string[] }[];
  placeholder: string;
};

export function SelectField(props: SelectProps) {
  const { id, value, onChange, groups, placeholder, hint, error, optional } = props;
  return (
    <Field {...props}>
      <select
        id={id}
        name={id}
        value={value}
        required={!optional}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.currentTarget.value)}
        class={`${controlClass} appearance-none bg-[url(/icons/chevron.svg)] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`}
      >
        <option value="">{placeholder}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

interface CheckProps {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ComponentChildren;
  description?: string;
  describedById?: string | undefined;
}

export function CheckCard({ id, checked, onChange, children, description, describedById }: CheckProps) {
  return (
    <label
      for={id}
      class="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-white p-3.5 transition-colors hover:border-primary-300 has-checked:border-primary-600 has-checked:bg-primary-50"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={describedById}
        onChange={(e) => onChange(e.currentTarget.checked)}
        class="mt-0.5 size-5 shrink-0 accent-primary-600"
      />
      <span class="flex flex-col">
        <span class="text-[0.9375rem] font-medium text-ink">{children}</span>
        {description && <span class="text-sm text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
