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

  useEffect(() => {
  /*
   * Globe size.
   */
  const getZoom = () => {
    if (window.innerWidth < 640) {
      return 2.5;
    }

    return 3.45;
  };

  /*
   * Move the globe DOWN without moving the actual canvas.
   *
   * The top padding changes the camera's visual center.
   */
  const getCameraPadding = () => {
    const height =
      container.current?.clientHeight ??
      window.innerHeight;

    return {
      top: Math.round(height * 0.52),
      bottom: 0,
      left: 0,
      right: 0,
    };
  };

  /*
   * Apply globe positioning.
   */
  const positionGlobe = (
    map: MapLibreMap
  ) => {
    map.jumpTo({
      center: [-95, 20],

      zoom: getZoom(),

      pitch: 0,
      bearing: 0,

      padding: getCameraPadding(),
    });
  };

    if (!container.current) {
      return;
    }

    const previous =
      takeEarth(container.current);

    const style =
      previous?.style ??
      themeStyle();

    const map =
      previous?.map ??
      new MapLibreMap({
        container:
          container.current,

        style,

        interactive: false,

        minZoom: -2,

        center: [-95, 20],

        zoom: getZoom(),

        pitch: 0,
        bearing: 0,

        attributionControl: {
          compact: true,
        },
      });

    mapRef.current = map;

    activeStyle.current =
      style;

    registerEarth(
      map,
      style
    );

    /*
     * IMPORTANT:
     *
     * Let MapLibre render into the full hero-sized canvas.
     * Then move the camera inside that canvas.
     */
    map.resize();

    positionGlobe(map);

    /*
     * Handle hero/window resizing.
     */
    const resizeObserver =
      new ResizeObserver(() => {
        if (
          earthIsHeld(map) ||
          !ownsEarth(map)
        ) {
          return;
        }

        map.resize();

        positionGlobe(map);
      });

    resizeObserver.observe(
      container.current
    );

    /*
     * Remove all labels/text from the map.
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
          // Ignore unsupported symbol layers.
        }
      }
    };

    /*
     * Called whenever the style finishes loading.
     */
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

      /*
       * Reapply size/position after switching
       * projection because the projection change
       * can affect camera rendering.
       */
      map.resize();

      positionGlobe(map);

      removeAllLabels();

      requestAnimationFrame(() => {
        if (!ownsEarth(map)) {
          return;
        }

        map.resize();

        positionGlobe(map);

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

    /*
     * Reused map may already be loaded.
     */
    if (
      previous?.ready &&
      map.isStyleLoaded()
    ) {
      ready();
    }

    return () => {
      resizeObserver.disconnect();

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
        ownsEarth(map) &&
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

    if (!map) {
      return;
    }

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
        pointer-events-none
        absolute
        inset-0
        overflow-hidden
      "
      aria-hidden="true"
    >
      {/*
       * Keep the actual MapLibre WebGL viewport
       * exactly the same size as the hero.
       *
       * DO NOT translate or scale this.
       */}
      <div
        ref={container}
        className="
          absolute
          inset-0
          h-full
          w-full
        "
      />

      {/*
       * Slight blur over the globe.
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