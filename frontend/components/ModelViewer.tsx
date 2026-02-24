"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bounds,
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
  };
  if (cloned.color) cloned.color.set("#dfe5f2");
  if (typeof cloned.roughness === "number") cloned.roughness = 0.78;
  if (typeof cloned.metalness === "number") cloned.metalness = 0.06;
  if (typeof cloned.flatShading === "boolean") cloned.flatShading = false;
  cloned.transparent = true;
  cloned.opacity = transparent ? 0.6 : 1;
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
  upright
}: {
  object: Object3D;
  axis: RotationAxis;
  speed: number;
  upright: boolean;
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
    <group ref={groupRef} rotation={upright ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <primitive object={object} />
    </group>
  );
}

function GltfModel({
  url,
  transparent,
  smoothingEnabled,
  smoothingLevel,
  upright,
  rotationAxis,
  rotationSpeed
}: {
  url: string;
  transparent: boolean;
  smoothingEnabled: boolean;
  smoothingLevel: number;
  upright: boolean;
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
        upright={upright}
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
  const [upright, setUpright] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
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
        className="relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-white to-[#edf5ff] p-4 shadow-soft"
      >
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-teal/10 blur-3xl" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-sm font-semibold text-ink">3D Reconstruction</p>
            <p className="text-xs text-slate">High-clarity model viewer with optional smoothing and axis control</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate/20 bg-white/80 px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setTransparent((prev) => !prev)}
            >
              {transparent ? "Solid" : "Transparent"}
            </button>
            <button
              className="rounded-full border border-slate/20 bg-white/80 px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setSmoothingEnabled((prev) => !prev)}
            >
              {smoothingEnabled ? "Smoothed On" : "Smoothed Off"}
            </button>
            <button
              className="rounded-full border border-slate/20 bg-white/80 px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setUpright((prev) => !prev)}
            >
              {upright ? "Free Orientation" : "Upright"}
            </button>
            <button
              className="rounded-full border border-slate/20 bg-white/80 px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setShowAxes((prev) => !prev)}
            >
              {showAxes ? "Hide Axes" : "Show Axes"}
            </button>
            <button
              className="rounded-full border border-slate/20 bg-white/80 px-4 py-2 text-xs font-semibold text-slate"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
              onClick={handleLoad}
            >
              {status === "loading" ? "Loading..." : "Load Model"}
            </button>
          </div>
        </div>

        <div className={`${isFullscreen ? "h-[calc(100vh-92px)]" : "h-[520px]"} relative rounded-2xl border border-white/70 bg-white/70`}>
          <Canvas camera={{ position: [2.5, 1.9, 2.4], fov: 40 }}>
            <ambientLight intensity={0.72} />
            <directionalLight position={[4, 5, 3]} intensity={1.6} />
            <directionalLight position={[-2, 1, -3]} intensity={0.55} />
            <Environment preset="studio" />

            {gltfUrl ? (
              <GltfModel
                url={gltfUrl}
                transparent={transparent}
                smoothingEnabled={smoothingEnabled}
                smoothingLevel={smoothingLevel}
                upright={upright}
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

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.85}
              zoomSpeed={0.85}
              panSpeed={0.8}
              minDistance={0.4}
              maxDistance={9}
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
        <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-soft">
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

        <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-soft">
          <p className="text-sm font-semibold text-ink">Navigation</p>
          <ul className="mt-2 space-y-2 text-xs text-slate">
            <li>Left drag: rotate</li>
            <li>Right drag: pan</li>
            <li>Wheel: zoom</li>
            <li>Use gizmo at bottom-right to align to principal axes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
