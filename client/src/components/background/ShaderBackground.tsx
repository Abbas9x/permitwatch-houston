import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { ShaderMaterial } from 'three';

/**
 * "Air" field: domain-warped fractal noise drifting slowly, tinted with the brand
 * orange over black. Kept dark (with a vignette) so text above it keeps
 * WCAG AA contrast. Lazy-loaded; the static gradient shows until it is ready.
 */
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform float uDive;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.02 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    p *= 1.0 - 0.35 * uDive;               // "dive" into the city on search
    p += uPointer * 0.04;                  // gentle parallax
    float t = uTime * 0.035;

    vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t)), fbm(p * 1.3 + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p * 1.7 + 3.0 * q + vec2(1.7, 9.2) + 0.6 * t),
                  fbm(p * 1.7 + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
    float f = fbm(p * 1.1 + 2.4 * r);

    vec3 night  = vec3(0.0, 0.0, 0.0);
    vec3 teal   = vec3(0.976, 0.451, 0.086);
    vec3 sky    = vec3(1.0, 0.6, 0.25);
    vec3 violet = vec3(0.75, 0.3, 0.05);

    vec3 col = night;
    col = mix(col, teal * 0.5, smoothstep(0.3, 0.95, f));
    col = mix(col, sky * 0.48, smoothstep(0.5, 1.1, length(q)) * 0.75);
    col = mix(col, violet * 0.5, smoothstep(0.5, 1.0, r.x) * 0.65);

    // Thin luminous filaments, like dust caught in light.
    float filament = smoothstep(0.02, 0.0, abs(f - 0.58)) * 0.45;
    col += filament * mix(sky, teal, q.x);

    // Vignette keeps the centre (where the text sits) darker.
    float vignette = smoothstep(1.35, 0.15, length(p * vec2(0.85, 1.15)));
    col *= mix(0.45, 1.0, vignette);
    col *= 1.0 + 0.6 * uDive;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function AirField({ dive }: { dive: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const { size, viewport } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: [1, 1] },
      uPointer: { value: [0, 0] },
      uDive: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const m = material.current;
    if (!m) return;
    const u = m.uniforms as typeof uniforms;
    u.uTime.value += delta;
    u.uRes.value = [size.width * viewport.dpr, size.height * viewport.dpr];
    const [px, py] = u.uPointer.value as [number, number];
    u.uPointer.value = [px + (state.pointer.x - px) * 0.03, py + (state.pointer.y - py) * 0.03];
    u.uDive.value += ((dive ? 1 : 0) - u.uDive.value) * Math.min(1, delta * 4);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={material} vertexShader={VERTEX} fragmentShader={FRAGMENT} uniforms={uniforms} depthWrite={false} />
    </mesh>
  );
}

export interface ShaderBackgroundProps {
  dive: boolean;
  onReady: () => void;
  /** Called when the device can't keep up; the parent swaps in the static gradient. */
  onFallback: () => void;
}

export default function ShaderBackground({ dive, onReady, onFallback }: ShaderBackgroundProps) {
  const [dpr, setDpr] = useState(1.25);
  return (
    <Canvas
      aria-hidden="true"
      dpr={dpr}
      gl={{ antialias: false, alpha: false, powerPreference: 'low-power', depth: false, stencil: false }}
      onCreated={() => onReady()}
      style={{ position: 'absolute', inset: 0 }}
    >
      <PerformanceMonitor
        bounds={() => [40, 60]}
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(0.6, d - 0.3))}
        onIncline={() => setDpr((d) => Math.min(1.5, d + 0.15))}
        onFallback={onFallback}
      />
      <AirField dive={dive} />
    </Canvas>
  );
}
