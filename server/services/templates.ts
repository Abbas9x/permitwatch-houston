import type { PermitSummaryText } from '../../shared/api.js';
import type { Permit } from '../../shared/permit.js';
import type { CommentConcern, Language } from '../../shared/validation.js';

/**
 * Deterministic text built directly from source fields, without an external service.
 * Every sentence is built from dataset fields; missing fields are stated as "not listed".
 */

const fmt = (n: number, lang: Language) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US').format(n);

function listJoin(items: string[], lang: Language): string {
  return new Intl.ListFormat(lang === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(items);
}

const WHATS_CHANGING: Record<Language, Record<Permit['permitType'], string>> = {
  en: {
    new: 'This notice is for a new concrete batch plant permit.',
    renewal: 'This notice is to renew the permit of an existing concrete batch plant.',
    amendment: 'This notice is to change (amend) an existing concrete batch plant permit.',
    unknown: 'The notice does not say whether this is a new permit, a renewal, or an amendment.',
  },
  es: {
    new: 'Este aviso es para un permiso nuevo de planta de concreto.',
    renewal: 'Este aviso es para renovar el permiso de una planta de concreto existente.',
    amendment: 'Este aviso es para cambiar (enmendar) el permiso de una planta de concreto existente.',
    unknown: 'El aviso no indica si se trata de un permiso nuevo, una renovación o una enmienda.',
  },
};

const HEADLINE: Record<Language, Record<Permit['permitType'], string>> = {
  en: {
    new: 'New concrete batch plant permit',
    renewal: 'Concrete batch plant permit renewal',
    amendment: 'Concrete batch plant permit amendment',
    unknown: 'Concrete batch plant air permit notice',
  },
  es: {
    new: 'Permiso nuevo de planta de concreto',
    renewal: 'Renovación de permiso de planta de concreto',
    amendment: 'Enmienda de permiso de planta de concreto',
    unknown: 'Aviso de permiso de aire de planta de concreto',
  },
};

export function templateSummaryText(permit: Permit, lang: Language): PermitSummaryText {
  const en = lang === 'en';
  const parts: string[] = [];
  parts.push(
    en
      ? `${permit.company} has an air permit notice (registration ${permit.registrationNumber}) for a concrete batch plant at ${permit.address}, ${permit.city}.`
      : `${permit.company} tiene un aviso de permiso de aire (registro ${permit.registrationNumber}) para una planta de concreto en ${permit.address}, ${permit.city}.`,
  );
  if (permit.maxProductionCydPerHr !== null) {
    parts.push(
      en
        ? `It is permitted to produce up to ${fmt(permit.maxProductionCydPerHr, lang)} cubic yards of concrete per hour.`
        : `Tiene permiso para producir hasta ${fmt(permit.maxProductionCydPerHr, lang)} yardas cúbicas de concreto por hora.`,
    );
  } else {
    parts.push(en ? 'The notice does not list a maximum production rate.' : 'El aviso no indica una tasa máxima de producción.');
  }
  if (permit.maxHoursPerYear !== null) {
    parts.push(
      en
        ? `It may operate up to ${fmt(permit.maxHoursPerYear, lang)} hours per year.`
        : `Puede operar hasta ${fmt(permit.maxHoursPerYear, lang)} horas al año.`,
    );
  } else {
    parts.push(en ? 'The notice does not list annual operating hours.' : 'El aviso no indica las horas de operación anuales.');
  }
  if (permit.pollutants.length > 0) {
    parts.push(
      en
        ? `It is permitted to emit: ${listJoin(permit.pollutants, lang)}.`
        : `Tiene permiso para emitir: ${listJoin(permit.pollutants, lang)}.`,
    );
  }
  if (permit.controls) {
    parts.push(en ? `Listed pollution controls: ${permit.controls}` : `Controles de contaminación indicados: ${permit.controls}`);
  }
  return {
    headline: HEADLINE[lang][permit.permitType],
    summary: parts.join(' '),
    whatsChanging: WHATS_CHANGING[lang][permit.permitType],
  };
}

export const CONCERN_LABELS: Record<Language, Record<CommentConcern, string>> = {
  en: {
    dust: 'dust and particulate matter from the plant',
    truck_traffic: 'truck traffic on neighborhood streets',
    noise: 'noise from plant operations and trucks',
    hours: 'the permitted operating hours',
    proximity_homes_schools: 'how close the plant is to homes, schools, and parks',
    cumulative: 'other industrial facilities already operating nearby',
    water_runoff: 'stormwater runoff from the site',
    more_information: 'the need for more information and a public meeting',
  },
  es: {
    dust: 'el polvo y las partículas de la planta',
    truck_traffic: 'el tráfico de camiones en las calles del vecindario',
    noise: 'el ruido de la operación de la planta y de los camiones',
    hours: 'las horas de operación permitidas',
    proximity_homes_schools: 'la cercanía de la planta a viviendas, escuelas y parques',
    cumulative: 'otras instalaciones industriales que ya operan cerca',
    water_runoff: 'la escorrentía de aguas pluviales del sitio',
    more_information: 'la necesidad de más información y de una reunión pública',
  },
};

export interface CommentDraft {
  subject: string;
  body: string;
}

export function templateCommentDraft(
  permit: Permit,
  concerns: CommentConcern[],
  personalNote: string,
  lang: Language,
): CommentDraft {
  const en = lang === 'en';
  const concernText = listJoin(
    concerns.map((c) => CONCERN_LABELS[lang][c]),
    lang,
  );
  const lines: string[] = [];
  lines.push(en ? 'To the Office of the Chief Clerk, TCEQ:' : 'A la Oficina del Secretario Oficial (Chief Clerk), TCEQ:');
  lines.push('');
  lines.push(
    en
      ? `I am writing about the air permit for ${permit.company}, registration ${permit.registrationNumber}, for a concrete batch plant at ${permit.address}, ${permit.city}.`
      : `Escribo sobre el permiso de aire de ${permit.company}, registro ${permit.registrationNumber}, para una planta de concreto en ${permit.address}, ${permit.city}.`,
  );
  const facts: string[] = [];
  if (permit.maxProductionCydPerHr !== null) {
    facts.push(
      en
        ? `up to ${fmt(permit.maxProductionCydPerHr, lang)} cubic yards per hour`
        : `hasta ${fmt(permit.maxProductionCydPerHr, lang)} yardas cúbicas por hora`,
    );
  }
  if (permit.maxHoursPerYear !== null) {
    facts.push(en ? `up to ${fmt(permit.maxHoursPerYear, lang)} hours per year` : `hasta ${fmt(permit.maxHoursPerYear, lang)} horas al año`);
  }
  if (facts.length > 0) {
    lines.push(
      en
        ? `According to the notice, the plant would be permitted to operate at ${listJoin(facts, lang)}.`
        : `Según el aviso, la planta tendría permiso para operar a ${listJoin(facts, lang)}.`,
    );
  }
  if (concerns.length > 0) {
    lines.push(
      en
        ? `I respectfully ask TCEQ to carefully consider my concerns about ${concernText}.`
        : `Le pido respetuosamente a TCEQ que considere mis preocupaciones sobre ${concernText}.`,
    );
  }
  if (personalNote.trim()) {
    lines.push(personalNote.trim());
  }
  lines.push(
    en
      ? 'Please include this comment in the public record for this application. Thank you for your consideration.'
      : 'Por favor incluyan este comentario en el expediente público de esta solicitud. Gracias por su consideración.',
  );
  lines.push('');
  lines.push(en ? '[Your name]\n[Your mailing address]' : '[Su nombre]\n[Su dirección postal]');

  return {
    subject: en
      ? `Public comment on air permit registration ${permit.registrationNumber} (${permit.company})`
      : `Comentario público sobre el permiso de aire, registro ${permit.registrationNumber} (${permit.company})`,
    body: lines.join('\n'),
  };
}
