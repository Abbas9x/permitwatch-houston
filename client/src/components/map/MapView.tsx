import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
// MapLibre 6 loads its tile worker from a sibling file; bundlers move it, so point MapLibre at the emitted asset.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type {PermitCategory} from '../../../../shared/permit';
import {CATEGORY_SYMBOLS} from '../../lib/permitCategories';
import { useTheme } from '../../lib/theme';
import { takeEarth } from './earthHandoff';
import type { LatLng } from '../../../../shared/geo';
import { DARK_STYLE_URL, LIGHT_STYLE_URL, hasWebGL, EARTH_OVERVIEW, ringBounds, ringLabelPoints, ringsGeoJson, ringWallsGeoJson } from './mapGeo';

export interface MapPlant {
  id: string;
  lat: number;
  lng: number;
  color: string;
  category?: PermitCategory;
  label: string;
}

export interface MapViewProps {
  onReady?: () => void;
  center: LatLng;
  radiusMiles: number;
  plants: MapPlant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  ariaLabel: string;
  youLabel: string;
  sharedLocationLabel?: (count: number) => string;
  unavailableText: string;
  loadingText: string;
  /** Shown when tiles take unusually long (slow network or cold server), instead of claiming the map is unsupported. */
  slowText: string;
  /** Map padding that keeps a selected plant visible beside an open side panel (desktop). */
  panelPadding: { right: number; bottom: number };
}

setWorkerUrl(maplibreWorkerUrl);

const RING_SOURCE = 'pw-rings';
const RING_WALL_SOURCE = 'pw-ring-walls';

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
  const core=el.querySelector('.pw-marker-core');
  if(core) core.textContent=plant.category ? CATEGORY_SYMBOLS[plant.category] : '';
  el.dataset.category=plant.category??'concrete_batch_plant';
}

/** Separate icons in screen pixels while retaining each source coordinate. */
function sharedMarkerOffsets(plants: MapPlant[]) {
  const groups = new Map<string, MapPlant[]>();
  for (const plant of plants) {
    const key = `${plant.lat},${plant.lng}`;
    const group = groups.get(key) ?? [];
    group.push(plant);
    groups.set(key, group);
  }
  const offsets = new Map<string, {offset: [number, number]; count: number}>();
  for (const group of groups.values()) {
    group.sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const radius = group.length > 1 ? 24 / Math.sin(Math.PI / group.length) : 0;
    group.forEach((plant,index)=>{
      const angle = Math.PI + index * 2 * Math.PI / group.length;
      offsets.set(plant.id,{offset:[radius*Math.cos(angle),radius*Math.sin(angle)],count:group.length});
    });
  }
  return offsets;
}

export default function MapView(props: MapViewProps) {
  const { center, radiusMiles, plants, selectedId, reducedMotion, sharedLocationLabel } = props;
  const { theme } = useTheme();
  const lightWall = theme === 'light';
  const styleUrl = useEffectEvent(() => theme === 'light' ? LIGHT_STYLE_URL : DARK_STYLE_URL);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasPositioned = useRef(false);
  const positionedSearch = useRef<string | null>(null);
  const positionedSelection = useRef<string | null | undefined>(undefined);
  const currentStyle = useRef<string | null>(null);
  const plantMarkers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const overlayMarkers = useRef<Marker[]>([]);
  const [webgl] = useState(hasWebGL);
  const [ready, setReady] = useState(0);
  const [slow, setSlow] = useState(false);

  const select = useEffectEvent((id: string) => props.onSelect(id));
  const reveal = useEffectEvent(() => props.onReady?.());

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!webgl || !container) return;
    const earth = takeEarth(container);
    currentStyle.current = earth?.style ?? styleUrl();
    const map = earth?.map ?? new MapLibreMap({
      container,
      style: currentStyle.current,
      center: EARTH_OVERVIEW.center,
      zoom: EARTH_OVERVIEW.zoom,
      pitch: EARTH_OVERVIEW.pitch,
      bearing: EARTH_OVERVIEW.bearing,
      maxPitch: 75,
      attributionControl: { compact: true },
      // On phones the map sits in the page flow: two-finger pan so one finger still scrolls the page.
      cooperativeGestures: window.matchMedia('(max-width: 1023px)').matches,
    });
    mapRef.current = map;
    if (earth) {
      map.scrollZoom.enable();map.boxZoom.enable();map.dragRotate.enable();map.dragPan.enable();
      map.keyboard.enable();map.doubleClickZoom.enable();map.touchZoomRotate.enable();map.touchPitch.enable();
      if (window.matchMedia('(max-width: 1023px)').matches) map.cooperativeGestures.enable();
      map.getCanvas().tabIndex = 0;
    }
    // Browser zoom or a window resize can switch between the phone and desktop layouts after load.
    const phoneLayout = window.matchMedia('(max-width: 1023px)');
    const syncGestures = () => {
      if (phoneLayout.matches) map.cooperativeGestures.enable();
      else map.cooperativeGestures.disable();
    };
    phoneLayout.addEventListener('change', syncGestures);
    const markers = plantMarkers.current;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    const slowTimer = window.setTimeout(() => setSlow(true), 12_000);

    // 'style.load' fires as soon as the style is parsed; 'load' would also wait for every initial tile,
    // which at a tilted city-wide view takes many seconds. Tiles keep streaming in behind the rings and markers.
    const prepareStyle = () => {
      map.setProjection({type:'globe'});
      window.clearTimeout(slowTimer);
      // Atmosphere: a lit horizon and fog instead of a black void when the map is tilted or rotated.
      map.setSky({
        'sky-color': '#181818',
        'horizon-color': '#555555',
        'fog-color': '#222222',
        'sky-horizon-blend': 0.75,
        'horizon-fog-blend': 0.55,
        'fog-ground-blend': 0.35,
        'atmosphere-blend': 0,
      });
      // Directional light so 3D buildings and ring walls get shaded faces.
      map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.4, position: [1.4, 210, 35] });
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
              'fill-extrusion-color': '#777777',
              // Full height as soon as building data exists (tiles carry buildings from zoom 13).
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.4, ['coalesce', ['get', 'render_height'], 0]],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.9,
              'fill-extrusion-vertical-gradient': true,
            },
          },
          firstSymbol,
        );
      }
      map.addSource(RING_WALL_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'pw-rings-walls',
        type: 'fill-extrusion',
        source: RING_WALL_SOURCE,
        paint: {
          'fill-extrusion-color': '#f97316',
          'fill-extrusion-height': 0,
          'fill-extrusion-base': 0,
          // Strong in the overview, fading as you zoom into streets so the walls never cover buildings.
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0.42, 14, 0.18, 15.5, 0.06],
          'fill-extrusion-vertical-gradient': true,
        },
      });
      map.addSource(RING_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'pw-rings-fill',
        type: 'fill',
        source: RING_SOURCE,
        paint: { 'fill-color': '#f97316', 'fill-opacity': 0 },
      });
      map.addLayer({
        id: 'pw-rings-outline',
        type: 'line',
        source: RING_SOURCE,
        paint: { 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0 },
      });
      map.addLayer({
        id: 'pw-rings-line',
        type: 'line',
        source: RING_SOURCE,
        paint: {
          'line-color': '#f97316',
          'line-width': 2,
          'line-opacity': 0,
        },
      });
      setReady(version => version + 1);
    };
    map.on('style.load', prepareStyle);
    if (earth?.ready) prepareStyle();

    return () => {
      phoneLayout.removeEventListener('change', syncGestures);
      window.clearTimeout(slowTimer);
      map.off('style.load', prepareStyle);
      markers.clear();
      overlayMarkers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [webgl]);

  useEffect(() => {
    const map = mapRef.current;
    const nextStyle = theme === 'light' ? LIGHT_STYLE_URL : DARK_STYLE_URL;
    if (map && currentStyle.current !== nextStyle) {
      currentStyle.current = nextStyle;
      map.setStyle(nextStyle, {diff: false});
    }
  }, [theme]);

  // Reveal after the location camera and its tiles settle. Slow/offline maps must
  // still expose the results and the existing slow-network notice.
  useEffect(() => {
    if (!webgl) {
      reveal();
      return;
    }
    const map = mapRef.current;
    const onIdle = () => {
      if (hasPositioned.current) reveal();
    };
    map?.on('idle', onIdle);
    const timeout = window.setTimeout(() => reveal(), 12_000);
    return () => {
      map?.off('idle', onIdle);
      window.clearTimeout(timeout);
    };
  }, [webgl, ready, center.lat, center.lng]);



  // Update only boundary colors when the device appearance changes; keep the map and camera in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource(RING_SOURCE)) return;
    const color = lightWall ? '#ffffff' : '#f97316';
    map.setSky({ 'sky-color': lightWall ? '#ffffff' : '#181818', 'horizon-color': lightWall ? '#eeeeee' : '#555555', 'fog-color': lightWall ? '#ffffff' : '#222222' });
    map.setPaintProperty('pw-rings-walls', 'fill-extrusion-color', color);
    map.setPaintProperty('pw-rings-fill', 'fill-color', color);
    map.setPaintProperty('pw-rings-line', 'line-color', color);
    map.setPaintProperty('pw-rings-line', 'line-width', lightWall ? 1.25 : 2);
    map.setPaintProperty('pw-rings-outline', 'line-color', lightWall ? '#525252' : '#000000');
    map.setPaintProperty('pw-rings-outline', 'line-width', lightWall ? 3.5 : 6);
    map.setPaintProperty('pw-rings-walls', 'fill-extrusion-opacity', ['interpolate', ['linear'], ['zoom'], 12.5, lightWall ? 0.12 : 0.42, 14, lightWall ? 0.06 : 0.18, 15.5, lightWall ? 0.02 : 0.06]);
  }, [ready, lightWall]);

  // Search location: rings, "you" marker, ring labels, and the camera fly-in.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource(RING_SOURCE)) return;
    (map.getSource(RING_SOURCE) as GeoJSONSource | undefined)?.setData(ringsGeoJson(center, radiusMiles));
    (map.getSource(RING_WALL_SOURCE) as GeoJSONSource | undefined)?.setData(ringWallsGeoJson(center, radiusMiles));

    for (const m of overlayMarkers.current) m.remove();
    const you = document.createElement('div');
    you.className = 'pw-you';
    you.setAttribute('role', 'img');
    you.setAttribute('aria-label', props.youLabel);
    you.title = props.youLabel;
    const markers = [new Marker({ element: you }).setLngLat([center.lng, center.lat]).addTo(map)];
    for (const { radius, point } of ringLabelPoints(center, radiusMiles)) {
      const label = document.createElement('div');
      label.className = 'pw-ring-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = `${radius} mi`;
      markers.push(new Marker({ element: label, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(map));
    }
    overlayMarkers.current = markers;

    // Animate the first arrival, then resize quickly without rebuilding the map.
    const firstView = !hasPositioned.current;
    hasPositioned.current = true;
    let frame = 0;
    const start = performance.now() + (reducedMotion || !firstView ? 0 : 1500);
    const animateRing = (now: number) => {
      if (!map.getLayer('pw-rings-walls')) return;
      const t = reducedMotion ? 1 : Math.max(0, Math.min(1, (now - start) / (firstView ? 1600 : 350)));
      const eased = 1 - (1 - t) ** 3;
      map.setPaintProperty('pw-rings-walls', 'fill-extrusion-height', ['*', ['get', 'h'], eased]);
      map.setPaintProperty('pw-rings-line', 'line-opacity', 0.85 * eased);
      map.setPaintProperty('pw-rings-outline', 'line-opacity', (lightWall ? 0.8 : 0.95) * eased);
      map.setPaintProperty('pw-rings-fill', 'fill-opacity', (lightWall ? 0 : 0.045) * eased);
      if (t < 1) frame = requestAnimationFrame(animateRing);
    };
    frame = requestAnimationFrame(animateRing);

    const searchPosition = `${center.lat},${center.lng},${radiusMiles}`;
    if (positionedSearch.current === searchPosition) return () => cancelAnimationFrame(frame);
    positionedSearch.current = searchPosition;
    const camera = map.cameraForBounds(ringBounds(center, radiusMiles), { padding: 36 });
    const target = { center: [center.lng, center.lat] as [number, number], zoom: camera?.zoom ?? 12.5, pitch: 56, bearing: -18, padding: {top:0,bottom:0,left:0,right:0} };
    if (reducedMotion) map.jumpTo(target);
    else if (firstView) map.flyTo({ ...target, duration: 3200, curve: 1.5, essential: false });
    else map.easeTo({ ...target, duration: 450 });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to location, distance and motion preference
  }, [ready, center.lat, center.lng, radiusMiles, reducedMotion, lightWall]);

  // Plant markers: keep DOM buttons in sync with the result list.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource(RING_SOURCE)) return;
    const existing = plantMarkers.current;
    const nextIds = new Set(plants.map((p) => p.id));
    const offsets = sharedMarkerOffsets(plants);
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
      const placement = offsets.get(plant.id)!;
      entry.marker.setOffset(placement.offset);
      if(placement.count > 1){
        entry.el.dataset.sharedLocation = String(placement.count);
        const label = `${plant.label}. ${sharedLocationLabel?.(placement.count) ?? ''}`;
        entry.el.setAttribute('aria-label',label);entry.el.title=label;
      }else delete entry.el.dataset.sharedLocation;
    }
  }, [ready, plants, sharedLocationLabel]);

  // Selection: highlight the marker and bring it into view beside the panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource(RING_SOURCE)) return;
    for (const [id, { el }] of plantMarkers.current) {
      el.classList.toggle('is-selected', id === selectedId);
      el.setAttribute('aria-pressed', String(id === selectedId));
    }
    if (positionedSelection.current === selectedId) return;
    const plant = plants.find((p) => p.id === selectedId);
    if (!plant) {
      if (selectedId === null) positionedSelection.current = null;
      return;
    }
    positionedSelection.current = selectedId;
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
      <div className="flex h-full items-center justify-center bg-night-2 p-6 text-center text-sm text-muted">
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
            {slow ? props.slowText : props.loadingText}
          </p>
        </div>
      )}
    </div>
  );
}
