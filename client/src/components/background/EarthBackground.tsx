import 'maplibre-gl/dist/maplibre-gl.css';

import {
  Map as MapLibreMap,
  setWorkerUrl,
} from 'maplibre-gl';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import {
  useEffect,
  useEffectEvent,
  useRef,
} from 'react';

import { useTheme } from '../../lib/theme';

import {
  DARK_STYLE_URL,
  LIGHT_STYLE_URL,
} from '../map/mapGeo';

import {
  disposeEarth,
  earthIsHeld,
  ownsEarth,
  parkEarth,
  registerEarth,
  takeEarth,
  updateEarthStyle,
} from '../map/earthHandoff';

setWorkerUrl(workerUrl);

export default function EarthBackground({
  reducedMotion,
  onReady,
}: {
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const { theme } = useTheme();

  const container =
    useRef<HTMLDivElement>(null);

  const mapRef =
    useRef<MapLibreMap | null>(null);

  const activeStyle =
    useRef<string | null>(null);

  const themeStyle = useEffectEvent(
    () =>
      theme === 'light'
        ? LIGHT_STYLE_URL
        : DARK_STYLE_URL
  );

  const notifyReady =
    useEffectEvent(onReady);

  /*
   * Globe sizing.
   *
   * Increase these if you want an even
   * bigger globe.
   */
  const getZoom = () =>
    window.innerWidth < 640
      ? 2.4
      : 3.4;

  useEffect(() => {
    if (!container.current) return;

    const previous =
      takeEarth(container.current);

    const style =
      previous?.style ??
      themeStyle();

    const map =
      previous?.map ??
      new MapLibreMap({
        container: container.current,

        style,

        interactive: false,

        minZoom: -2,

        center: [-95, 20],

        /*
         * Bigger globe.
         */
        zoom: getZoom(),

        pitch: 0,
        bearing: 0,

        attributionControl: {
          compact: true,
        },
      });

    /*
     * Reset reused globe.
     */
    if (previous) {
      map.jumpTo({
        center: [-95, 20],

        zoom: getZoom(),

        pitch: 0,
        bearing: 0,

        padding: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      });
    }

    mapRef.current = map;
    activeStyle.current = style;

    registerEarth(
      map,
      style
    );

    /*
     * Remove all text:
     *
     * - countries
     * - states
     * - cities
     * - roads
     * - POIs
     */
    const removeAllLabels = () => {
      if (!map.isStyleLoaded()) {
        return;
      }

      const currentStyle =
        map.getStyle();

      const layers =
        currentStyle.layers ?? [];

      for (const layer of layers) {
        if (
          layer.type !== 'symbol'
        ) {
          continue;
        }

        try {
          const textField =
            map.getLayoutProperty(
              layer.id,
              'text-field'
            );

          if (
            textField === undefined ||
            textField === null ||
            textField === ''
          ) {
            continue;
          }

          map.setLayoutProperty(
            layer.id,
            'text-field',
            ''
          );
        } catch {
          // Ignore unsupported layers.
        }
      }
    };

    const ready = () => {
      if (!ownsEarth(map)) {
        return;
      }

      map.setProjection({
        type: 'globe',
      });

      updateEarthStyle(
        map,
        activeStyle.current!,
        true
      );

      removeAllLabels();

      requestAnimationFrame(() => {
        removeAllLabels();
      });

      notifyReady();
    };

    map.on(
      'style.load',
      ready
    );

    map.on(
      'styledata',
      removeAllLabels
    );

    map.on(
      'idle',
      removeAllLabels
    );

    if (
      previous?.ready &&
      map.isStyleLoaded()
    ) {
      ready();
      removeAllLabels();
    }

    return () => {
      map.off(
        'style.load',
        ready
      );

      map.off(
        'styledata',
        removeAllLabels
      );

      map.off(
        'idle',
        removeAllLabels
      );

      if (earthIsHeld(map)) {
        parkEarth(map);
      } else {
        disposeEarth(map);
      }

      mapRef.current = null;
    };
  }, []);

  /*
   * Globe rotation.
   */
  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      reducedMotion
    ) {
      return;
    }

    let frame = 0;

    let last =
      performance.now();

    const rotate = (
      now: number
    ) => {
      const delta =
        Math.min(
          now - last,
          100
        );

      last = now;

      if (
        !earthIsHeld(map) &&
        document.visibilityState ===
          'visible'
      ) {
        const center =
          map.getCenter();

        map.setCenter([
          center.lng +
            delta * 0.0025,

          center.lat,
        ]);
      }

      frame =
        requestAnimationFrame(
          rotate
        );
    };

    frame =
      requestAnimationFrame(
        rotate
      );

    return () => {
      cancelAnimationFrame(
        frame
      );
    };
  }, [reducedMotion]);

  /*
   * Light / dark mode.
   */
  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) return;

    const style =
      theme === 'light'
        ? LIGHT_STYLE_URL
        : DARK_STYLE_URL;

    if (
      activeStyle.current ===
      style
    ) {
      return;
    }

    activeStyle.current =
      style;

    updateEarthStyle(
      map,
      style,
      false
    );

    map.setStyle(
      style,
      {
        diff: false,
      }
    );
  }, [theme]);

  return (
    <div
      className="
        pw-earth
        absolute
        inset-0
        overflow-hidden
      "
      aria-hidden="true"
    >
      {/*
        Globe

        translate-y-[28%]
        pushes it downward so only the upper
        portion / roughly half the globe is visible.

        scale-[1.08]
        makes it slightly more dominant without
        needing ridiculous MapLibre zoom values.
      */}
      <div
        ref={container}
        className="
          absolute
          inset-0
          h-full
          w-full
          translate-y-[28%]
          scale-[1.08]
          origin-center
        "
      />

      {/*
        Soft blur over the globe.
      */}
      <div
        className="
          pointer-events-none
          absolute
          inset-0
          backdrop-blur-[1.5px]
        "
      />
    </div>
  );
}