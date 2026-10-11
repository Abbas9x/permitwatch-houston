import type { Map as MapLibreMap } from 'maplibre-gl';

interface EarthSession { map: MapLibreMap; style: string; ready: boolean; held: boolean; onReady: () => void; }
let session: EarthSession | null = null;
let backdrop: HTMLDivElement | null = null;

export function registerEarth(map: MapLibreMap, style: string) {
  const onReady = () => {
    if (session?.map === map) {
      map.setProjection({type:'globe'});
      session.ready = true;
    }
  };
  session = {map, style, ready:false, held:false, onReady};
  map.on('style.load', onReady);
}
export function updateEarthStyle(map: MapLibreMap, style: string, ready: boolean) {
  if (session?.map === map) Object.assign(session, {style, ready});
}
export function ownsEarth(map: MapLibreMap) { return session?.map === map; }
export function earthIsHeld(map: MapLibreMap) { return session?.map === map && session.held; }

/** Freeze the globe while search resolves. The live canvas survives the page change. */
export function holdEarthForSearch() { if (session) session.held = true; }

export function parkEarth(map: MapLibreMap) {
  if (!earthIsHeld(map)) return;
  backdrop = document.createElement('div');
  backdrop.className = 'pw-earth-handoff';
  backdrop.setAttribute('aria-hidden','true');
  document.body.append(backdrop);
  backdrop.append(map.getContainer());
  map.resize();
}

/** Transfer ownership, DOM, tiles and camera together; never recreate the WebGL canvas. */
export function takeEarth(container: HTMLDivElement): EarthSession | null {
  if (!session?.held) return null;
  const taken = session;
  session = null;
  taken.map.off('style.load', taken.onReady);
  const element = taken.map.getContainer();
  element.classList.add('h-full','w-full');
  container.append(element);
  backdrop?.remove();backdrop = null;
  taken.map.resize();
  return taken;
}

export function disposeEarth(map: MapLibreMap) {
  if (!ownsEarth(map)) return;
  map.off('style.load', session!.onReady);
  session = null;
  backdrop?.remove();backdrop = null;
  map.remove();
}

/** Release the parked globe when a search ends without a map. */
export function discardHeldEarth() {
  if (session?.held) disposeEarth(session.map);
}
