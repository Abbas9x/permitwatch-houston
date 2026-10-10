import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
// MapLibre 6 loads its tile worker from a sibling file; bundlers move it, so point MapLibre at the emitted asset.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { MAX_SEARCH_RADIUS_MILES, type LatLng } from '../../../../shared/geo';
import { DARK_STYLE_URL, hasWebGL, HOUSTON_OVERVIEW, ringBounds, ringLabelPoints, ringsGeoJson } from './mapGeo';

export interface MapPlant {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
}

export interface MapViewProps {
  center: LatLng;
  plants: MapPlant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  ariaLabel: string;
  youLabel: string;
  unavailableText: string;
  loadingText: string;
  /** Map padding that keeps a selected plant visible beside an open side panel (desktop). */
  panelPadding: { right: number; bottom: number };
}

setWorkerUrl(maplibreWorkerUrl);

const RING_SOURCE = 'pw-rings';
const RING_OPACITY: Record<number, number> = { 1: 0.95, 2: 0.65, 3: 0.4 };

function plantElement(plant: MapPlant): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pw-marker';
  el.dataset.plantId = plant.id;
  const pulse = document.createElement('span');
  pulse.className = 'pw-marker-pulse';
  pulse.setAttribute('aria-hidden', 'true');
  const core = document.createElement('span');
  core.className = 'pw-marker-core';
  core.setAttribute('aria-hidden', 'true');
  el.append(pulse, core);
  return el;
}

function updatePlantElement(el: HTMLButtonElement, plant: MapPlant) {
  el.style.setProperty('--c', plant.color);
  el.setAttribute('aria-label', plant.label);
  el.title = plant.label;
}

export default function MapView(props: MapViewProps) {
  const { center, plants, selectedId, reducedMotion } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const plantMarkers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const overlayMarkers = useRef<Marker[]>([]);
  const [webgl] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  const select = useEffectEvent((id: string) => props.onSelect(id));

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!webgl || !container) return;
    const map = new MapLibreMap({
      container,
      style: DARK_STYLE_URL,
      center: HOUSTON_OVERVIEW.center,
      zoom: HOUSTON_OVERVIEW.zoom,
      pitch: HOUSTON_OVERVIEW.pitch,
      bearing: HOUSTON_OVERVIEW.bearing,
      maxPitch: 70,
      attributionControl: { compact: true },
      // On phones the map sits in the page flow: two-finger pan so one finger still scrolls the page.
      cooperativeGestures: window.matchMedia('(max-width: 1023px)').matches,
    });
    mapRef.current = map;
    const markers = plantMarkers.current;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    const slowTimer = window.setTimeout(() => setSlow(true), 12_000);

    map.on('load', () => {
      window.clearTimeout(slowTimer);
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      if (map.getSource('openmaptiles')) {
        map.addLayer(
          {
            id: 'pw-buildings-3d',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 13,
            filter: ['!=', ['get', 'hide_3d'], true],
            paint: {
              'fill-extrusion-color': '#1a2338',
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, ['coalesce', ['get', 'render_height'], 0]],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.8,
            },
          },
          firstSymbol,
        );
      }
      map.addSource(RING_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'pw-rings-fill',
        type: 'fill',
        source: RING_SOURCE,
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0 },
      });
      map.addLayer({
        id: 'pw-rings-line',
        type: 'line',
        source: RING_SOURCE,
        paint: {
          'line-color': ['match', ['get', 'radius'], 1, '#2dd4bf', 2, '#38bdf8', '#a78bfa'],
          'line-width': ['match', ['get', 'radius'], 1, 2, 1.5],
          'line-opacity': 0,
        },
      });
      setReady(true);
    });

    return () => {
      window.clearTimeout(slowTimer);
      markers.clear();
      overlayMarkers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [webgl]);

  // Search location: rings, "you" marker, ring labels, and the camera fly-in.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(RING_SOURCE) as GeoJSONSource | undefined)?.setData(ringsGeoJson(center));

    for (const m of overlayMarkers.current) m.remove();
    const you = document.createElement('div');
    you.className = 'pw-you';
    you.setAttribute('role', 'img');
    you.setAttribute('aria-label', props.youLabel);
    const markers = [new Marker({ element: you }).setLngLat([center.lng, center.lat]).addTo(map)];
    for (const { radius, point } of ringLabelPoints(center)) {
      const label = document.createElement('div');
      label.className = 'pw-ring-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = `${radius} mi`;
      markers.push(new Marker({ element: label, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(map));
    }
    overlayMarkers.current = markers;

    // Rings fade in one after another (instantly with reduced motion).
    let frame = 0;
    const start = performance.now();
    const animateRings = (now: number) => {
      const t = reducedMotion ? 1 : Math.min(1, (now - start) / 1400);
      map.setPaintProperty('pw-rings-line', 'line-opacity', [
        'match',
        ['get', 'radius'],
        1,
        RING_OPACITY[1]! * Math.min(1, t * 3),
        2,
        RING_OPACITY[2]! * Math.max(0, Math.min(1, t * 3 - 1)),
        RING_OPACITY[3]! * Math.max(0, Math.min(1, t * 3 - 2)),
      ]);
      map.setPaintProperty('pw-rings-fill', 'fill-opacity', 0.045 * t);
      if (t < 1) frame = requestAnimationFrame(animateRings);
    };
    frame = requestAnimationFrame(animateRings);

    const camera = map.cameraForBounds(ringBounds(center, MAX_SEARCH_RADIUS_MILES), { padding: 36 });
    const target = { center: [center.lng, center.lat] as [number, number], zoom: camera?.zoom ?? 12.5, pitch: 48, bearing: -14 };
    if (reducedMotion) map.jumpTo(target);
    else map.flyTo({ ...target, duration: 3200, curve: 1.5, essential: false });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the location changes
  }, [ready, center.lat, center.lng, reducedMotion]);

  // Plant markers: keep DOM buttons in sync with the result list.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const existing = plantMarkers.current;
    const nextIds = new Set(plants.map((p) => p.id));
    for (const [id, { marker }] of existing) {
      if (!nextIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
    for (const plant of plants) {
      let entry = existing.get(plant.id);
      if (!entry) {
        const el = plantElement(plant);
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          select(plant.id);
        });
        entry = { el, marker: new Marker({ element: el }).setLngLat([plant.lng, plant.lat]).addTo(map) };
        existing.set(plant.id, entry);
      }
      entry.marker.setLngLat([plant.lng, plant.lat]);
      updatePlantElement(entry.el, plant);
    }
  }, [ready, plants]);

  // Selection: highlight the marker and bring it into view beside the panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [id, { el }] of plantMarkers.current) {
      el.classList.toggle('is-selected', id === selectedId);
      el.setAttribute('aria-pressed', String(id === selectedId));
    }
    const plant = plants.find((p) => p.id === selectedId);
    if (!plant) return;
    const options = {
      center: [plant.lng, plant.lat] as [number, number],
      zoom: Math.max(map.getZoom(), 13.4),
      padding: { top: 40, left: 40, right: props.panelPadding.right, bottom: props.panelPadding.bottom },
    };
    if (reducedMotion) map.jumpTo(options);
    else map.easeTo({ ...options, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to selection changes only
  }, [ready, selectedId]);

  if (!webgl) {
    return (
      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgb(56_189_248/0.14),transparent_60%)] p-6 text-center text-sm text-muted">
        {props.unavailableText}
      </div>
    );
  }

  return (
    <div role="region" aria-label={props.ariaLabel} className="relative h-full w-full">
      {/* maplibre-gl.css forces position:relative on this element, so size it with h-full/w-full, not inset. */}
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-night/60">
          <p role="status" className="rounded-full border border-line bg-night/80 px-4 py-2 text-sm text-muted">
            {slow ? props.unavailableText : props.loadingText}
          </p>
        </div>
      )}
    </div>
  );
}
