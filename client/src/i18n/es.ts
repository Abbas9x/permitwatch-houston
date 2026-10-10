import type { Messages } from './en';

export const es: Messages = {
  'app.name': 'PermitWatch Houston',
  'app.tagline': 'La IA que combate la contaminación no debería generar más.',
  'nav.skip': 'Saltar al contenido principal',
  'nav.search': 'Buscar',
  'nav.dashboard': 'GreenRoute',
  'nav.language': 'English',
  'nav.languageLabel': 'Switch to English',

  'hero.kicker': 'Permisos de aire de plantas de concreto · Houston',
  'hero.title1': '¿Qué se está permitiendo',
  'hero.title2': 'en el aire cerca de usted?',
  'hero.subtitle':
    'Ingrese su dirección o código postal. Le mostramos cada permiso de planta de concreto cercana, explicado en lenguaje sencillo con los números reales del permiso, y cómo comentar antes de la fecha límite.',

  'search.label': 'Dirección o código postal de Houston',
  'search.placeholder': 'p. ej. 4014 Market St, Houston, TX 77020',
  'search.submit': 'Buscar',
  'search.searching': 'Buscando…',
  'search.try': 'Pruebe:',
  'search.error.empty': 'Ingrese una dirección de Houston o un código postal de 5 dígitos.',
  'search.error.too_short': 'Ingrese una dirección de Houston o un código postal de 5 dígitos.',
  'search.error.too_long': 'Es demasiado largo. Por favor acórtelo.',
  'search.error.invalid_zip': 'Los códigos postales tienen exactamente 5 dígitos.',
  'search.error.invalid_chars': 'Use solo letras, números y signos comunes de direcciones.',

  'results.heading': 'Plantas de concreto cerca de {place}',
  'results.approximate': 'Usando el centro del código postal {zip} (ubicación aproximada).',
  'results.geocoderDown': 'El servicio de búsqueda de direcciones no responde, así que usamos su código postal.',
  'results.none': 'No hay plantas de concreto con permiso a menos de {radius} millas en nuestros datos.',
  'results.nearest': 'La más cercana que conocemos es {company}, a {distance} millas al {direction}.',
  'results.count.one': '{count} planta a menos de {radius} millas',
  'results.count.other': '{count} plantas a menos de {radius} millas',
  'results.listLabel': 'Plantas ordenadas por distancia',
  'results.newSearch': 'Nueva búsqueda',
  'results.loadingLabel': 'Cargando resultados',

  'plant.distance': '{distance} mi al {direction}',
  'plant.distanceLong': 'a {distance} millas al {direction} de usted',
  'plant.registration': 'Registro {number}',
  'plant.viewDetails': 'Ver detalles del permiso',
  'plant.maxProduction': 'Producción máxima',
  'plant.maxProductionValue': '{value} yardas cúbicas/hora',
  'plant.maxHours': 'Horas máximas de operación',
  'plant.maxHoursValue': '{value} horas/año',
  'plant.pollutants': 'Permitido emitir',
  'plant.controls': 'Controles de contaminación',
  'plant.noticeType': 'Tipo de aviso',
  'plant.noticeDate': 'Aviso emitido',
  'plant.deadline': 'Fecha límite para comentarios',
  'plant.meeting': 'Reunión pública',
  'plant.notListed': 'No aparece en el aviso – consulte a TCEQ',
  'plant.source': 'Fuente oficial',
  'plant.sourceLink': 'Ver aviso original',
  'plant.address': 'Ubicación',

  'type.new': 'Nuevo',
  'type.renewal': 'Renovación',
  'type.amendment': 'Enmienda',
  'type.unknown': 'Tipo no indicado',

  'sample.badge': 'Datos de muestra',
  'sample.banner':
    'Estos resultados incluyen DATOS DE MUESTRA (plantas ficticias) mientras se prepara el conjunto real de permisos.',

  'disclaimer.permits': 'Los permisos muestran la actividad máxima permitida, no la contaminación medida.',

  'dir.N': 'norte',
  'dir.NE': 'noreste',
  'dir.E': 'este',
  'dir.SE': 'sureste',
  'dir.S': 'sur',
  'dir.SW': 'suroeste',
  'dir.W': 'oeste',
  'dir.NW': 'noroeste',

  'error.generic': 'Algo salió mal. Inténtelo de nuevo.',
  'error.network': 'No podemos conectar con PermitWatch. Revise su conexión e inténtelo de nuevo.',
  'error.timeout': 'Tardó demasiado. Inténtelo de nuevo.',
  'error.retry': 'Reintentar',

  'footer.data': 'Datos de permisos: avisos públicos de la Comisión de Calidad Ambiental de Texas (TCEQ).',
  'footer.geocoder': 'Búsqueda de direcciones: Geocodificador de la Oficina del Censo de EE. UU.',
  'footer.notAdvice':
    'PermitWatch es una herramienta cívica independiente, sin afiliación con TCEQ. Confirme siempre los detalles en el aviso oficial.',
};
