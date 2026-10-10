/**
 * Output quality gates. AI text is rejected (and retried once on the large model) when it:
 *  - contains a number that does not appear in the source data (invented / computed numbers),
 *  - contains URLs, emails or phone numbers that are not allowed,
 *  - makes health or safety claims.
 */

const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

/** Every reasonable reading of a numeric token: "8,760" / "8.760" -> 8760, "2,5" -> 2.5, "1.200,5" -> 1200.5. */
export function numberVariants(token: string): string[] {
  const variants = new Set<string>();
  const add = (s: string) => {
    const n = Number(s);
    if (Number.isFinite(n)) variants.add(String(n));
  };
  add(token.replace(/[.,]/g, ''));
  add(token.replace(/,/g, ''));
  add(token.replace(/\./g, '').replace(',', '.'));
  return [...variants];
}

export function numbersIn(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? [];
}

/** Returns numbers in `outputs` that cannot be found anywhere in `sources`. */
export function ungroundedNumbers(outputs: string[], sources: string[]): string[] {
  const known = new Set<string>();
  for (const source of sources) {
    for (const token of numbersIn(source)) for (const v of numberVariants(token)) known.add(v);
  }
  const bad = new Set<string>();
  for (const output of outputs) {
    for (const token of numbersIn(output)) {
      if (!numberVariants(token).some((v) => known.has(v))) bad.add(token);
    }
  }
  return [...bad];
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const BARE_DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gov|io|co|info|biz|us|xyz|ly|me)\b(?:\/[^\s<>"')]*)?/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

function hostOf(link: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Flags links, emails and phone numbers unless their host is on the allow-list (e.g. tceq.texas.gov). */
export function contactProblems(text: string, allowedHostSuffixes: string[] = []): string[] {
  const problems: string[] = [];
  const allowed = (host: string | null) =>
    host !== null && allowedHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  const withoutEmails = text.replace(EMAIL_PATTERN, ' ');
  const links = new Set([...(withoutEmails.match(URL_PATTERN) ?? []), ...(withoutEmails.match(BARE_DOMAIN) ?? [])]);
  for (const link of links) {
    if (!allowed(hostOf(link))) problems.push(`link not allowed: ${link.slice(0, 60)}`);
  }
  for (const email of text.match(EMAIL_PATTERN) ?? []) {
    if (!allowed(email.split('@')[1]?.toLowerCase() ?? null)) problems.push('email address not allowed');
  }
  if (PHONE_PATTERN.test(text)) problems.push('phone number not allowed');
  PHONE_PATTERN.lastIndex = 0;
  return problems;
}

const HEALTH_CLAIMS: RegExp[] = [
  /\b(?:dangerous|unsafe|toxic|poisonous|deadly|lethal|carcinogenic|hazardous to (?:your|human) health)\b/i,
  /\b(?:will|would|could|can|may|does|do|is going to)\s+(?:make|cause|give|lead to)\b[^.]{0,40}\b(?:sick|illness|cancer|asthma|disease|death|harm)\b/i,
  /\bcauses?\s+(?:cancer|asthma|disease|illness|death)\b/i,
  /\b(?:is|are)\s+(?:completely\s+)?safe\b/i,
  /\b(?:peligros[oa]s?|t[oó]xic[oa]s?|mortal(?:es)?|cancer[ií]gen[oa]s?)\b/i,
  /\b(?:causa|causar[áa]|provoca|provocar[áa])\s+(?:c[áa]ncer|asma|enfermedad(?:es)?|muerte)\b/i,
  /\b(?:es|son)\s+(?:completamente\s+)?segur[oa]s?\b/i,
];

export function healthClaimProblems(text: string): string[] {
  return HEALTH_CLAIMS.filter((re) => re.test(text)).map((re) => `health/safety claim matched ${re.source.slice(0, 30)}…`);
}
