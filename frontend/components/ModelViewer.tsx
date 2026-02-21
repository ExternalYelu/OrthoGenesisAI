"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useState } from "react";
import { getModelFileUrl } from "@/lib/api";

function GltfModel({ url, transparent }: { url: string; transparent: boolean }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((child) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = child as any;
      if (mesh.isMesh && mesh.material) {
        mesh.material.transparent = true;
        mesh.material.opacity = transparent ? 0.6 : 1;
        mesh.material.needsUpdate = true;
      }
    });
  }, [scene, transparent]);

  return <primitive object={scene} />;
}

export function ModelViewer() {
  const [transparent, setTransparent] = useState(false);
  const [modelId, setModelId] = useState("1");
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleLoad = async () => {
    try {
      setStatus("loading");
      setMessage("Fetching model...");
      setGltfUrl(getModelFileUrl(Number(modelId)));
      setStatus("idle");
      setMessage("Model loaded.");
    } catch (error) {
      setStatus("error");
      setMessage("Unable to load model. Check token and model id.");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-3xl border border-slate/10 bg-white/80 p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-sm font-semibold text-ink">3D Reconstruction</p>
            <p className="text-xs text-slate">Interactive model viewer</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate/20 px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setTransparent((prev) => !prev)}
            >
              {transparent ? "Solid" : "Transparent"}
            </button>
            <button
              className="rounded-full border border-slate/20 px-4 py-2 text-xs font-semibold text-slate"
              onClick={handleLoad}
            >
              {status === "loading" ? "Loading..." : "Load Model"}
            </button>
          </div>
        </div>
        <div className="h-[420px] rounded-2xl bg-grid-fade">
          <Canvas camera={{ position: [2.6, 2.2, 2.6], fov: 45 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 3, 5]} intensity={1} />
            {gltfUrl ? (
              <GltfModel url={gltfUrl} transparent={transparent} />
            ) : (
              <mesh>
                <sphereGeometry args={[1, 64, 64]} />
                <meshStandardMaterial
                  color="#E6EEF7"
                  transparent={transparent}
                  opacity={transparent ? 0.6 : 1}
                />
              </mesh>
            )}
            <OrbitControls enablePan enableZoom />
          </Canvas>
        </div>
        {message ? (
          <p className={`mt-3 text-xs ${status === "error" ? "text-red-600" : "text-slate"}`}>
            {message}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-sm font-semibold text-ink">Load Model</p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Model ID</p>
              <input
                className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-sm font-semibold text-ink">Measurement Tools</p>
          <ul className="mt-2 space-y-2 text-xs text-slate">
            <li>Length, angle, and volume markers</li>
            <li>Cross-section slicing</li>
            <li>Deformity highlighting</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-sm font-semibold text-ink">Comparison Mode</p>
          <p className="mt-2 text-xs text-slate">
            Toggle pre/post surgery overlays with synchronized rotation.
          </p>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-sm font-semibold text-ink">Annotations</p>
          <p className="mt-2 text-xs text-slate">
            Add clinical notes and share with the care team.
          </p>
        </div>
      </div>
    </div>
  );
}
