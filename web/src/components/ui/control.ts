/** Shared classes for text inputs, selects and textareas. */
export const controlClass =
  'w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-base text-ink ' +
  'placeholder:text-ink-muted/70 transition-colors hover:border-primary-300 ' +
  'focus:border-primary-600 focus:outline-none focus-visible:outline-none focus:ring-3 focus:ring-primary-100 ' +
  'aria-invalid:border-danger aria-invalid:ring-red-100 disabled:bg-surface';

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}
