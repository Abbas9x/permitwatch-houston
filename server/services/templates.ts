import { shouldCheckOfficialRecord } from '../../shared/commentPolicy.js';
import type { PermitSummaryText } from '../../shared/api.js';
import type { Permit, PermitCategory } from '../../shared/permit.js';
import type { CommentConcern, Language } from '../../shared/validation.js';

/**
 * Deterministic text built directly from source fields, without an external service.
 * Every sentence is built from dataset fields; missing fields are stated as "not listed".
 */

const fmt = (n: number, lang: Language) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US').format(n);

function listJoin(items: string[], lang: Language): string {
  return new Intl.ListFormat(lang === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(items);
}

type ByType = Record<Permit['permitType'], string>;

const AIR_WHATS_CHANGING: Record<Language, ByType> = {
  en: {
    new: 'This is an application for a new air permit for this facility.',
    renewal: "This is an application to renew the facility's existing air permit.",
    amendment: "This is an application to change (amend) the facility's existing air permit.",
    unknown: 'The record does not say whether this is a new permit, a renewal, or an amendment.',
  },
  es: {
    new: 'Es una solicitud de un permiso de aire nuevo para esta instalación.',
    renewal: 'Es una solicitud para renovar el permiso de aire existente de la instalación.',
    amendment: 'Es una solicitud para cambiar (enmendar) el permiso de aire existente de la instalación.',
    unknown: 'El registro no indica si se trata de un permiso nuevo, una renovación o una enmienda.',
  },
};

const AIR_HEADLINE: Record<Language, ByType> = {
  en: {
    new: 'New industrial air permit application',
    renewal: 'Industrial air permit renewal',
    amendment: 'Industrial air permit amendment',
    unknown: 'Industrial air permit application',
  },
  es: {
    new: 'Solicitud de permiso de aire industrial nuevo',
    renewal: 'Renovación de permiso de aire industrial',
    amendment: 'Enmienda de permiso de aire industrial',
    unknown: 'Solicitud de permiso de aire industrial',
  },
};

/** "a concrete batch plant" / "the ALBEMARLE CATALYSTS facility" / "an industrial facility". */
export function facilityPhrase(permit: Pick<Permit, 'category' | 'facilityName'>, lang: Language): string {
  const kinds: Record<PermitCategory, () => string> = {
    concrete_batch_plant: () => (lang === 'en' ? 'a concrete batch plant' : 'una planta de concreto'),
    wastewater_permit: () => lang === 'en' ? 'a wastewater discharge facility' : 'una instalación de descarga de aguas residuales',
    solid_waste_permit: () => lang === 'en' ? 'a solid-waste facility' : 'una instalación de residuos sólidos',
    air_permit: () =>
      permit.facilityName
        ? lang === 'en'
          ? `the ${permit.facilityName} facility`
          : `la instalación ${permit.facilityName}`
        : lang === 'en'
          ? 'an industrial facility'
          : 'una instalación industrial',
  };
  return kinds[permit.category]();
}

const WHATS_CHANGING: Record<Language, ByType> = {
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

const HEADLINE: Record<Language, ByType> = {
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
  if (permit.category === 'wastewater_permit' || permit.category === 'solid_waste_permit' || (permit.permitStatus !== undefined && permit.permitStatus !== 'pending')) {
    const names: Record<PermitCategory,string> = {wastewater_permit: en?'Wastewater discharge permit':'Permiso de descarga de aguas residuales',solid_waste_permit: en?'Solid-waste permit':'Permiso de residuos sólidos',air_permit: en?'Industrial air permit record':'Registro de permiso de aire industrial',concrete_batch_plant: en?'Concrete batch plant permit record':'Registro de permiso de planta de concreto'};
    const category = names[permit.category];
    const legalStatus = permit.permitStatus === 'unknown' ? (en?'not established by the source':'no establecido por la fuente') : permit.sourceStatus??permit.permitStatus??(en?'not listed':'no indicado');
    const concreteFacts = permit.category==='concrete_batch_plant' ? (permit.maxProductionCydPerHr !== null ? (en?` The source lists a maximum production rate of ${fmt(permit.maxProductionCydPerHr,lang)} cubic yards per hour.`:` La fuente indica una tasa máxima de producción de ${fmt(permit.maxProductionCydPerHr,lang)} yardas cúbicas por hora.`) : (en?' The source does not list a maximum production rate.':' La fuente no indica una tasa máxima de producción.')) : '';
    return {
      headline: category,
      summary: en
        ? `${permit.facilityName ?? permit.company} is listed under ${category.toLowerCase()} ${permit.registrationNumber}. Source-reported status: ${legalStatus}. The reported address is ${permit.address}, ${permit.city}. A permit status does not establish current operation or measured pollution.${concreteFacts}`
        : `${permit.facilityName ?? permit.company} figura bajo ${category.toLowerCase()} ${permit.registrationNumber}. Estado indicado en la fuente: ${legalStatus}. La dirección reportada es ${permit.address}, ${permit.city}. El estado del permiso no establece operación actual ni contaminación medida.${concreteFacts}`,
      whatsChanging: en ? 'This source lists an authorization record, not a new-change notice. Check the official record for current conditions and comment opportunities.' : 'Esta fuente indica un registro de autorización, no un aviso de cambios. Consulte el registro oficial para condiciones actuales y oportunidades de comentar.',
    };
  }
  if (permit.category === 'air_permit') {
    // Industrial case-by-case permit: production rate and hours are concrete-plant fields, so they are not mentioned.
    parts.push(
      en
        ? `${permit.company} has an air permit application (permit ${permit.registrationNumber}) for ${facilityPhrase(permit, lang)} at ${permit.address}, ${permit.city}.`
        : `${permit.company} tiene una solicitud de permiso de aire (permiso ${permit.registrationNumber}) para ${facilityPhrase(permit, lang)} en ${permit.address}, ${permit.city}.`,
    );
    if (permit.pollutants.length > 0) {
      parts.push(
        en
          ? `The application lists these air contaminants: ${listJoin(permit.pollutants, lang)}.`
          : `La solicitud indica estos contaminantes del aire: ${listJoin(permit.pollutants, lang)}.`,
      );
    } else {
      parts.push(en ? 'The record does not list the air contaminants.' : 'El registro no indica los contaminantes del aire.');
    }
    return {
      headline: AIR_HEADLINE[lang][permit.permitType],
      summary: parts.join(' '),
      whatsChanging: AIR_WHATS_CHANGING[lang][permit.permitType],
    };
  }
  parts.push(
    en
      ? `${permit.company} has an air permit notice (registration ${permit.registrationNumber}) for a concrete batch plant at ${permit.address}, ${permit.city}.`
      : `${permit.company} tiene un aviso de permiso de aire (registro ${permit.registrationNumber}) para una planta de concreto en ${permit.address}, ${permit.city}.`,
  );
  if (permit.maxProductionCydPerHr !== null) {
    parts.push(
      en
        ? `The source lists a maximum production rate of ${fmt(permit.maxProductionCydPerHr, lang)} cubic yards of concrete per hour.`
        : `La fuente indica una tasa máxima de producción de ${fmt(permit.maxProductionCydPerHr, lang)} yardas cúbicas de concreto por hora.`,
    );
  } else {
    parts.push(en ? 'The notice does not list a maximum production rate.' : 'El aviso no indica una tasa máxima de producción.');
  }
  if (permit.maxHoursPerYear !== null) {
    parts.push(
      en
        ? `The source lists an operating limit of ${fmt(permit.maxHoursPerYear, lang)} hours per year.`
        : `La fuente indica un límite de operación de ${fmt(permit.maxHoursPerYear, lang)} horas al año.`,
    );
  } else {
    parts.push(en ? 'The notice does not list annual operating hours.' : 'El aviso no indica las horas de operación anuales.');
  }
  if (permit.pollutants.length > 0) {
    parts.push(
      en
        ? `The source lists these pollutants: ${listJoin(permit.pollutants, lang)}.`
        : `La fuente indica estos contaminantes: ${listJoin(permit.pollutants, lang)}.`,
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
  if (shouldCheckOfficialRecord(permit)) return templateConcernDraft(permit, concerns, personalNote, lang);
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
      ? `I am writing about the ${permit.category === 'wastewater_permit' ? 'wastewater discharge' : permit.category === 'solid_waste_permit' ? 'solid-waste' : 'air'} permit for ${permit.company}, ${permit.category === 'concrete_batch_plant' ? 'registration' : 'permit'} ${permit.registrationNumber}, for ${facilityPhrase(permit, lang)} at ${permit.address}, ${permit.city}.`
      : `Escribo sobre el permiso ${permit.category === 'wastewater_permit' ? 'de descarga de aguas residuales' : permit.category === 'solid_waste_permit' ? 'de residuos sólidos' : 'de aire'} de ${permit.company}, ${permit.category === 'concrete_batch_plant' ? 'registro' : 'permiso'} ${permit.registrationNumber}, para ${facilityPhrase(permit, lang)} en ${permit.address}, ${permit.city}.`,
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


/** A resident can raise concerns or ask for information without a pending application. */
function templateConcernDraft(permit: Permit, concerns: CommentConcern[], personalNote: string, lang: Language): CommentDraft {
  const en = lang === 'en';
  const facility = permit.facilityName ?? permit.company;
  const topics: Record<Language, Record<CommentConcern, string>> = {
    en: {dust:'dust and particulate matter',truck_traffic:'truck traffic',noise:'noise',hours:'operating hours',proximity_homes_schools:'nearby homes, schools and parks',cumulative:'other nearby industry',water_runoff:'stormwater runoff',more_information:'more information and available public meetings'},
    es: {dust:'polvo y partículas',truck_traffic:'tráfico de camiones',noise:'ruido',hours:'horas de operación',proximity_homes_schools:'viviendas, escuelas y parques cercanos',cumulative:'otras industrias cercanas',water_runoff:'escorrentía de aguas pluviales',more_information:'más información y reuniones públicas disponibles'},
  };
  const lines = [en ? 'To TCEQ:' : 'A TCEQ:', '', en
    ? `I am writing about ${facility}, permit record ${permit.registrationNumber}, at the reported address ${permit.address}, ${permit.city}, ${permit.county} County, Texas.`
    : `Escribo sobre ${facility}, registro de permiso ${permit.registrationNumber}, en la dirección indicada ${permit.address}, ${permit.city}, condado de ${permit.county}, Texas.`,
    en ? `Official source: ${permit.sourceUrl}` : `Fuente oficial: ${permit.sourceUrl}`,
    en ? 'I would like information about the current permit conditions and the appropriate process for raising my concerns.' : 'Quisiera información sobre las condiciones actuales del permiso y el proceso adecuado para plantear mis preocupaciones.',
  ];
  if(concerns.length) lines.push(en ? `My concerns relate to ${listJoin(concerns.map(c=>topics[lang][c]),lang)}.` : `Mis preocupaciones se relacionan con ${listJoin(concerns.map(c=>topics[lang][c]),lang)}.`);
  if(personalNote.trim()) lines.push(personalNote.trim());
  lines.push(en ? 'The source record does not establish a current public-comment period. Please let me know whether any new notices or comment opportunities apply and how to submit any observations for review.' : 'El registro no establece un período actual de comentarios públicos. Por favor indíquenme si hay nuevos avisos u oportunidades para comentar y cómo presentar observaciones para su revisión.');
  lines.push('',en ? '[Your name, if you choose to provide it]' : '[Su nombre, si desea proporcionarlo]');
  return {subject:en ? `Concerns / request for information: permit ${permit.registrationNumber} (${facility})` : `Preocupaciones / solicitud de información: permiso ${permit.registrationNumber} (${facility})`,body:lines.join('\n')};
}
