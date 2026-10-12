import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { CoreState } from "./types";

export default function Core({
  state,
  amplitude,
  reduced,
}: {
  state: CoreState;
  amplitude: MutableRefObject<number>;
  reduced: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const values = useRef({ state, reduced });
  values.current = { state, reduced };
  useEffect(() => {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas.current!,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 6.4;
    const group = new THREE.Group();
    scene.add(group);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const geometry = new THREE.TorusGeometry(
        1.45 + i * 0.25,
        0.007,
        6,
        120,
        Math.PI * (1.1 + i * 0.2),
      );
      const material = new THREE.MeshBasicMaterial({
        color: 0x43dfe9,
        transparent: true,
        opacity: 0.25 + i * 0.06,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.rotation.set(i * 0.21, i * 0.2, i * 2.3);
      group.add(ring);
      materials.push(material);
      geometries.push(geometry);
    }
    const points = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const angle = i * 2.399;
      const radius = 2.1 + ((i % 17) / 17) * 0.8;
      points[i * 3] = Math.cos(angle) * radius;
      points[i * 3 + 1] = Math.sin(angle) * radius;
      points[i * 3 + 2] = (i % 7) / 7 - 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    geometries.push(geometry);
    const material = new THREE.PointsMaterial({
      color: 0x5ceef5,
      size: 0.012,
      transparent: true,
      opacity: 0.45,
    });
    materials.push(material);
    scene.add(new THREE.Points(geometry, material));
    const resize = () => {
      const size = canvas.current!.clientWidth;
      renderer.setSize(size, size, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.current!);
    resize();
    let frame = 0;
    let previous = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      if (!values.current.reduced) {
        const speed =
          values.current.state === "processing" ||
          values.current.state === "executing"
            ? 0.45
            : 0.055;
        group.children.forEach((ring, index) => {
          ring.rotation.z += dt * speed * (index % 2 ? -1 : 1);
        });
        group.scale.setScalar(1 + amplitude.current * 0.09);
      }
      core.current?.style.setProperty("--amplitude", String(amplitude.current));
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      renderer.dispose();
    };
  }, [amplitude]);

  return (
    <div
      ref={core}
      className={`ai-core core-${state} ${reduced ? "reduced" : ""}`}
      aria-label={`Núcleo JARVIS: ${state}`}
    >
      <canvas ref={canvas} className="core-canvas" aria-hidden="true" />
      <div className="core-halo" />
      <svg className="core-rings" viewBox="0 0 440 440" aria-hidden="true">
        <defs>
          <radialGradient id="core-fill">
            <stop stopColor="#13bfcf" stopOpacity=".13" />
            <stop offset="1" stopColor="#13bfcf" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.8" />
          </filter>
        </defs>
        <circle
          cx="220"
          cy="220"
          r="210"
          fill="none"
          stroke="currentColor"
          opacity=".08"
        />
        <g className="ring-slow">
          <circle
            cx="220"
            cy="220"
            r="195"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="170 14 4 14"
            opacity=".35"
          />
          <circle
            cx="220"
            cy="220"
            r="190"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeDasharray="65 240 130 230"
            opacity=".6"
          />
        </g>
        <circle
          cx="220"
          cy="220"
          r="177"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity=".22"
        />
        <g className="ring-reverse">
          <circle
            cx="220"
            cy="220"
            r="168"
            fill="none"
            stroke="currentColor"
            strokeWidth="11"
            strokeDasharray="2 10"
            opacity=".3"
          />
          <circle
            cx="220"
            cy="220"
            r="158"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="200 140 90 40"
            opacity=".75"
          />
        </g>
        <circle
          cx="220"
          cy="220"
          r="147"
          fill="url(#core-fill)"
          stroke="currentColor"
          opacity=".3"
        />
        <circle
          cx="220"
          cy="220"
          r="138"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="1 5"
          opacity=".8"
        />
        <circle
          cx="220"
          cy="220"
          r="124"
          fill="none"
          stroke="currentColor"
          opacity=".22"
        />
        <path
          d="M16 220h24m360 0h24M220 16v24m0 360v24"
          stroke="currentColor"
          opacity=".5"
        />
        <g className="ring-slow">
          <circle cx="220" cy="25" r="3" fill="currentColor" />
          <circle cx="220" cy="415" r="3" fill="currentColor" />
        </g>
      </svg>
      <div className="core-content">
        <span className="core-unit">NEURAL INTERFACE · 01</span>
        <strong>JARVIS</strong>
        <div className="core-wave" aria-hidden="true">
          {Array.from({ length: 35 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--height": `${8 + Math.pow(Math.sin(i * 1.83), 2) * 32}px`,
                  "--delay": `${i * -0.07}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <span className="core-caption">
          {state === "listening"
            ? "ESTOU OUVINDO"
            : state === "speaking"
              ? "TRANSMITINDO"
              : state === "processing"
                ? "PROCESSANDO"
                : state === "executing"
                  ? "EXECUTANDO"
                  : state === "generating"
                    ? "PREPARANDO VOZ"
                    : state === "error"
                      ? "REQUER ATENÇÃO"
                      : "AGUARDANDO COMANDO"}
        </span>
        <div className="core-dots">
          <i />
          <i />
          <i />
        </div>
      </div>
      <span className="core-coordinate coord-left">
        N 00.01
        <br />
        SYNAPSE
      </span>
      <span className="core-coordinate coord-right">
        LINK 01
        <br />
        SECURE
      </span>
    </div>
  );
}
