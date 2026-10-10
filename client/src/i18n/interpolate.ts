export type Vars = Record<string, string | number>;

/** Replaces {name} placeholders. Unknown placeholders are left as-is so missing values are visible. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
