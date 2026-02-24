"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bounds,
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BufferGeometry, Material, Mesh, Object3D, Group } from "three";
import { getModelFileUrl } from "@/lib/api";

type RotationAxis = "none" | "x" | "y" | "z";

function getIndexArray(geometry: BufferGeometry, vertexCount: number): Uint32Array {
  const index = geometry.index?.array;
  if (index) return Uint32Array.from(index as ArrayLike<number>);

  const generated = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) generated[i] = i;
  return generated;
}

function smoothGeometry(geometry: BufferGeometry, amount: number, iterations: number): void {
  const position = geometry.attributes.position;
  if (!position) return;

  const vertexCount = position.count;
  if (vertexCount === 0) return;

  const indices = getIndexArray(geometry, vertexCount);
  const neighbors: Array<Set<number>> = Array.from({ length: vertexCount }, () => new Set<number>());

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }

  let current = Float32Array.from(position.array as ArrayLike<number>);

  for (let step = 0; step < iterations; step += 1) {
    const next = Float32Array.from(current);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const adjacent = neighbors[vertex];
      if (adjacent.size === 0) continue;

      let avgX = 0;
      let avgY = 0;
      let avgZ = 0;

      for (const n of adjacent) {
        const ni = n * 3;
        avgX += current[ni];
        avgY += current[ni + 1];
        avgZ += current[ni + 2];
      }

      const divisor = adjacent.size;
      const base = vertex * 3;
      next[base] = current[base] + amount * (avgX / divisor - current[base]);
      next[base + 1] = current[base + 1] + amount * (avgY / divisor - current[base + 1]);
      next[base + 2] = current[base + 2] + amount * (avgZ / divisor - current[base + 2]);
    }
    current = next;
  }

  position.array.set(current);
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function cloneMaterialWithTransparency(material: Material, transparent: boolean): Material {
  const cloned = material.clone() as Material & {
    color?: { set: (value: string) => void };
    roughness?: number;
    metalness?: number;
    flatShading?: boolean;
    emissive?: { set: (value: string) => void };
    emissiveIntensity?: number;
  };
  if (cloned.color) cloned.color.set("#f4f7ff");
  if (cloned.emissive) cloned.emissive.set("#d5deef");
  if (typeof cloned.emissiveIntensity === "number") cloned.emissiveIntensity = 0.01;
  if (typeof cloned.roughness === "number") cloned.roughness = 0.45;
  if (typeof cloned.metalness === "number") cloned.metalness = 0.02;
  if (typeof cloned.flatShading === "boolean") cloned.flatShading = false;
  cloned.transparent = true;
  cloned.opacity = transparent ? 0.36 : 1;
  cloned.needsUpdate = true;
  return cloned;
}

function prepareScene(
  scene: Object3D,
  transparent: boolean,
  smoothingEnabled: boolean,
  smoothingLevel: number
): Object3D {
  const clone = scene.clone(true);
  const smoothingAmount = smoothingLevel * 0.33;
  const iterations = Math.max(1, Math.round(smoothingLevel * 8));

  clone.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.material) return;

    mesh.geometry = mesh.geometry.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (smoothingEnabled && smoothingLevel > 0) {
      smoothGeometry(mesh.geometry, smoothingAmount, iterations);
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) =>
        cloneMaterialWithTransparency(material as Material, transparent)
      );
    } else {
      mesh.material = cloneMaterialWithTransparency(mesh.material as Material, transparent);
    }
  });

  return clone;
}

function RotatingModel({
  object,
  axis,
  speed,
  planeAligned
}: {
  object: Object3D;
  axis: RotationAxis;
  speed: number;
  planeAligned: boolean;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    const angle = speed * delta;
    if (axis === "x") groupRef.current.rotation.x += angle;
    if (axis === "y") groupRef.current.rotation.y += angle;
    if (axis === "z") groupRef.current.rotation.z += angle;
  });

  return (
    <group ref={groupRef} rotation={planeAligned ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}>
      <primitive object={object} />
    </group>
  );
}

function GltfModel({
  url,
  transparent,
  smoothingEnabled,
  smoothingLevel,
  planeAligned,
  rotationAxis,
  rotationSpeed
}: {
  url: string;
  transparent: boolean;
  smoothingEnabled: boolean;
  smoothingLevel: number;
  planeAligned: boolean;
  rotationAxis: RotationAxis;
  rotationSpeed: number;
}) {
  const { scene } = useGLTF(url);

  const processedScene = useMemo(
    () => prepareScene(scene, transparent, smoothingEnabled, smoothingLevel),
    [scene, transparent, smoothingEnabled, smoothingLevel]
  );

  return (
    <Bounds fit clip observe margin={1.15}>
      <RotatingModel
        object={processedScene}
        axis={rotationAxis}
        speed={rotationSpeed}
        planeAligned={planeAligned}
      />
    </Bounds>
  );
}

export function ModelViewer() {
  const [transparent, setTransparent] = useState(false);
  const [modelId, setModelId] = useState("1");
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [smoothingLevel, setSmoothingLevel] = useState(0.18);
  const [smoothingEnabled, setSmoothingEnabled] = useState(false);
  const [planeAligned, setPlaneAligned] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [lockAbovePlane, setLockAbovePlane] = useState(true);
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>("none");
  const [rotationSpeed, setRotationSpeed] = useState(0.6);

  const viewerRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && viewerRef.current) {
        await viewerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      setStatus("error");
      setMessage("Fullscreen is not available in this browser session.");
    }
  };

  const handleLoad = async () => {
    const parsedId = Number(modelId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setStatus("error");
      setMessage("Enter a valid numeric model ID.");
      return;
    }

    try {
      setStatus("loading");
      setMessage("Fetching model...");

      const response = await fetch(getModelFileUrl(parsedId));
      if (!response.ok) throw new Error("Model not found or not ready.");

      const blob = await response.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setGltfUrl(url);
      setStatus("idle");
      setMessage("Model loaded.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to load model.");
    }
  };

  return (
    <div className="grid gap-7 lg:grid-cols-[2.2fr,1fr]">
      <div
        ref={viewerRef}
        className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft"
      >
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-ink">3D Reconstruction</p>
            <p className="text-xs text-slate-500">High-contrast anatomy viewer with axis control and smoothing</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setTransparent((prev) => !prev)}
            >
              {transparent ? "Solid" : "Transparent"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setSmoothingEnabled((prev) => !prev)}
            >
              {smoothingEnabled ? "Smoothed On" : "Smoothed Off"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setPlaneAligned((prev) => !prev)}
            >
              {planeAligned ? "Plane Aligned" : "Vertical"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setShowAxes((prev) => !prev)}
            >
              {showAxes ? "Hide Axes" : "Show Axes"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setLockAbovePlane((prev) => !prev)}
            >
              {lockAbovePlane ? "Above-Plane Lock" : "Free Orbit"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button
              className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-900 shadow-lg shadow-cyan-500/30"
              onClick={handleLoad}
            >
              {status === "loading" ? "Loading..." : "Load Model"}
            </button>
          </div>
        </div>

        <div className={`${isFullscreen ? "h-[calc(100vh-92px)]" : "h-[560px]"} relative rounded-2xl border border-slate-200 bg-[#eef2f8]`}>
          <Canvas shadows camera={{ position: [2.7, 2.2, 2.8], fov: 38 }}>
            <color attach="background" args={["#eef2f8"]} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={["#f8fbff", "#b9c5d8", 0.52]} />
            <directionalLight castShadow position={[4.2, 6.8, 4.8]} intensity={2.4} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <directionalLight position={[-4, 2.5, -3]} intensity={1.2} />
            <directionalLight position={[0, 3, -6]} intensity={0.95} />
            <Environment preset="studio" />

            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
              <planeGeometry args={[900, 900]} />
              <meshStandardMaterial color="#9aa9c0" roughness={0.9} metalness={0} />
            </mesh>
            <gridHelper args={[120, 20, "#8e9db5", "#a6b4ca"]} position={[0, -0.05, 0]} />

            {gltfUrl ? (
              <GltfModel
                url={gltfUrl}
                transparent={transparent}
                smoothingEnabled={smoothingEnabled}
                smoothingLevel={smoothingLevel}
                planeAligned={planeAligned}
                rotationAxis={rotationAxis}
                rotationSpeed={rotationSpeed}
              />
            ) : (
              <mesh>
                <sphereGeometry args={[0.9, 64, 64]} />
                <meshStandardMaterial color="#dbe8fb" />
              </mesh>
            )}

            {showAxes ? <axesHelper args={[1.25]} /> : null}
            <ContactShadows position={[0, -0.08, 0]} opacity={0.38} scale={12} blur={1.45} far={4.2} />

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.07}
              rotateSpeed={0.8}
              zoomSpeed={0.9}
              panSpeed={0.8}
              minDistance={0.4}
              maxDistance={9}
              minPolarAngle={0.03}
              maxPolarAngle={lockAbovePlane ? Math.PI * 0.5 : Math.PI - 0.03}
            />

            <GizmoHelper alignment="bottom-right" margin={[90, 90]}>
              <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="#0f172a" />
            </GizmoHelper>
          </Canvas>
        </div>

        {message ? (
          <p className={`relative z-10 mt-3 text-xs ${status === "error" ? "text-red-600" : "text-slate"}`}>
            {message}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-ink">Viewer Controls</p>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">Model ID</p>
              <input
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-3 py-2 text-sm"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">
                Smoothing ({Math.round(smoothingLevel * 100)}%)
              </p>
              <input
                className="mt-2 w-full accent-accent"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={smoothingLevel}
                onChange={(event) => setSmoothingLevel(Number(event.target.value))}
              />
              <p className="mt-2 text-[11px] text-slate/70">
                Keep smoothing low for sharper bone definition.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">Rotation Axis</p>
              <select
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-3 py-2 text-sm"
                value={rotationAxis}
                onChange={(event) => setRotationAxis(event.target.value as RotationAxis)}
              >
                <option value="none">Manual (no spin)</option>
                <option value="x">Spin Around X</option>
                <option value="y">Spin Around Y</option>
                <option value="z">Spin Around Z</option>
              </select>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">
                Axis Speed ({rotationSpeed.toFixed(1)} rad/s)
              </p>
              <input
                className="mt-2 w-full accent-accent"
                type="range"
                min={0.1}
                max={2.5}
                step={0.1}
                value={rotationSpeed}
                onChange={(event) => setRotationSpeed(Number(event.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-ink">Navigation</p>
          <ul className="mt-2 space-y-2 text-xs text-slate">
            <li>Left drag: rotate</li>
            <li>Right drag: pan</li>
            <li>Wheel: zoom</li>
            <li>Use Above-Plane Lock for clinical top-side inspection</li>
            <li>Use gizmo at bottom-right to align to principal axes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
