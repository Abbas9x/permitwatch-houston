import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useEffectEvent, useRef } from 'react';
import { useTheme } from '../../lib/theme';
import { DARK_STYLE_URL, LIGHT_STYLE_URL } from '../map/mapGeo';
import { disposeEarth, earthIsHeld, ownsEarth, parkEarth, registerEarth, takeEarth, updateEarthStyle } from '../map/earthHandoff';

setWorkerUrl(workerUrl);

export default function EarthBackground({reducedMotion, onReady}: {reducedMotion:boolean; onReady:()=>void}) {
  const {theme}=useTheme();
  const container=useRef<HTMLDivElement>(null);
  const mapRef=useRef<MapLibreMap | null>(null);
  const activeStyle=useRef<string | null>(null);
  const themeStyle=useEffectEvent(()=>theme==='light'?LIGHT_STYLE_URL:DARK_STYLE_URL);
  const notifyReady=useEffectEvent(onReady);

  useEffect(()=>{
    if (!container.current) return;
    const previous=takeEarth(container.current);
    const style=previous?.style ?? themeStyle();
    const map=previous?.map ?? new MapLibreMap({
      container:container.current,style,interactive:false,minZoom:-2,
      center:[-95,20],zoom:window.innerWidth<640?0.8:1.8,pitch:0,bearing:0,
      attributionControl:{compact:true},
    });
    if (previous) {
      map.jumpTo({center:[-95,20],zoom:window.innerWidth<640?0.8:1.8,pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0}});
    }
    mapRef.current=map;activeStyle.current=style;registerEarth(map,style);
    const ready=()=>{
      if (!ownsEarth(map)) return;
      map.setProjection({type:'globe'});
      updateEarthStyle(map,activeStyle.current!,true);
      notifyReady();
    };
    map.on('style.load',ready);
    if (previous?.ready) ready();
    return ()=>{
      map.off('style.load',ready);
      if (earthIsHeld(map)) parkEarth(map);else disposeEarth(map);
      mapRef.current=null;
    };
  },[]);

  // A motion-preference change stops rotation without replacing the live globe.
  useEffect(()=>{
    const map=mapRef.current;
    if (!map || reducedMotion) return;
    let frame=0;let last=performance.now();
    const rotate=(now:number)=>{
      const delta=Math.min(now-last,100);last=now;
      if (!earthIsHeld(map) && document.visibilityState==='visible') {
        const center=map.getCenter();map.setCenter([center.lng+delta*0.0025,center.lat]);
      }
      frame=requestAnimationFrame(rotate);
    };
    frame=requestAnimationFrame(rotate);
    return ()=>cancelAnimationFrame(frame);
  },[reducedMotion]);

  useEffect(()=>{
    const map=mapRef.current;
    const style=theme==='light'?LIGHT_STYLE_URL:DARK_STYLE_URL;
    if (map && activeStyle.current!==style) {
      activeStyle.current=style;updateEarthStyle(map,style,false);
      map.setStyle(style,{diff:false});
    }
  },[theme]);

  return <div className="pw-earth absolute inset-0" aria-hidden="true"><div ref={container} className="h-full w-full" /></div>;
}
