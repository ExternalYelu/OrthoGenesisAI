"use client";

import { useSearchParams } from "next/navigation";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import {
  Bounds,
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  Line,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BufferGeometry, Group, Material, Mesh, Object3D } from "three";
import * as THREE from "three";
import {
  AnnotationRecord,
  addAnnotationComment,
  createAnnotation,
  deleteAnnotation,
  getModelConfidence,
  getModelFileUrl,
  listAnnotations,
  updateAnnotation
} from "@/lib/api";

type RotationAxis = "none" | "x" | "y" | "z";
type ToolMode = "none" | "distance" | "angle" | "annotate";

type Point3 = [number, number, number];

type ConfidenceReport = {
  confidence?: number;
  overall_confidence?: number;
  observed_ratio?: number;
  adjusted_ratio?: number;
  inferred_ratio?: number;
  mode?: string;
};

type Measurement = {
  id: string;
  type: "distance" | "angle" | "surface" | "volume";
  value: number;
  unit: string;
  label: string;
  points: Point3[];
  createdAt: string;
};

type SceneMetrics = {
  area: number;
  volume: number;
  dimensions: [number, number, number];
};

type ComparisonSummary = {
  areaDeltaPct: number;
  volumeDeltaPct: number;
  widthDeltaPct: number;
  heightDeltaPct: number;
  depthDeltaPct: number;
};

const CONFIDENCE_COLORS = {
  observed: "#2f7ae5",
  adjusted: "#f59e0b",
  inferred: "#c026d3"
};

const ANNOTATION_COLORS: Record<string, string> = {
  low: "#1d4ed8",
  medium: "#f59e0b",
  high: "#ea580c",
  critical: "#be123c"
};

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

function createDefaultMaterial(
  transparent: boolean,
  confidenceOverlay: boolean,
  hasVertexColors: boolean,
  heatmapMode = false
): Material {
  if (heatmapMode && hasVertexColors) {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.02,
      transparent: true,
      opacity: transparent ? 0.5 : 1,
      side: THREE.DoubleSide
    });
  }

  if (confidenceOverlay && hasVertexColors) {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.03,
      transparent: true,
      opacity: transparent ? 0.45 : 1,
      side: THREE.DoubleSide
    });
  }

  return new THREE.MeshStandardMaterial({
    color: "#f8fbff",
    roughness: 0.38,
    metalness: 0.04,
    emissive: "#0f172a",
    emissiveIntensity: 0.055,
    transparent: true,
    opacity: transparent ? 0.42 : 1,
    side: THREE.DoubleSide
  });
}

function computeSceneMetrics(scene: Object3D): SceneMetrics {
  let area = 0;
  let volume = 0;
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);

  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    if (!position) return;

    const indices = getIndexArray(geometry, position.count);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let i = 0; i < indices.length; i += 3) {
      a.fromBufferAttribute(position, indices[i]);
      b.fromBufferAttribute(position, indices[i + 1]);
      c.fromBufferAttribute(position, indices[i + 2]);

      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      area += new THREE.Vector3().crossVectors(ab, ac).length() * 0.5;

      volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }
  });

  return {
    area: Math.abs(area),
    volume: Math.abs(volume),
    dimensions: [size.x, size.y, size.z]
  };
}

function buildDifferenceColors(reference: BufferGeometry, target: BufferGeometry): Float32Array | null {
  const refPos = reference.attributes.position;
  const targetPos = target.attributes.position;
  if (!refPos || !targetPos || refPos.count === 0 || targetPos.count === 0) return null;

  const count = Math.min(refPos.count, targetPos.count);
  const deltas = new Float32Array(count);
  let maxDelta = 0;

  for (let i = 0; i < count; i += 1) {
    const dx = targetPos.getX(i) - refPos.getX(i);
    const dy = targetPos.getY(i) - refPos.getY(i);
    const dz = targetPos.getZ(i) - refPos.getZ(i);
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
    deltas[i] = delta;
    maxDelta = Math.max(maxDelta, delta);
  }

  if (maxDelta <= 1e-6) return null;

  const colors = new Float32Array(targetPos.count * 3);
  for (let i = 0; i < targetPos.count; i += 1) {
    const normalized = i < count ? deltas[i] / maxDelta : 0;
    const low = new THREE.Color("#1d4ed8");
    const mid = new THREE.Color("#f59e0b");
    const high = new THREE.Color("#c026d3");
    const color = normalized < 0.5 ? low.clone().lerp(mid, normalized * 2) : mid.clone().lerp(high, (normalized - 0.5) * 2);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  return colors;
}

function prepareScene(
  scene: Object3D,
  transparent: boolean,
  smoothingEnabled: boolean,
  smoothingLevel: number,
  confidenceOverlay: boolean,
  heatmapReference?: BufferGeometry | null,
  heatmapEnabled = false
): Object3D {
  const clone = scene.clone(true);
  const smoothingAmount = smoothingLevel * 0.32;
  const iterations = Math.max(1, Math.round(smoothingLevel * 8));

  clone.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.material) return;

    mesh.geometry = mesh.geometry.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (smoothingEnabled && smoothingLevel > 0) smoothGeometry(mesh.geometry, smoothingAmount, iterations);
    mesh.geometry.computeVertexNormals();

    if (heatmapEnabled && heatmapReference) {
      const colors = buildDifferenceColors(heatmapReference, mesh.geometry);
      if (colors) mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }

    const hasVertexColors = Boolean(mesh.geometry.getAttribute("color"));
    const material = createDefaultMaterial(transparent, confidenceOverlay, hasVertexColors, heatmapEnabled);

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(() => material.clone());
    } else {
      mesh.material = material;
    }
  });

  return clone;
}

function RotatingObject({
  object,
  axis,
  speed,
  planeAligned,
  offset,
  onPick
}: {
  object: Object3D;
  axis: RotationAxis;
  speed: number;
  planeAligned: boolean;
  offset?: number;
  onPick?: (point: Point3) => void;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    const angle = speed * delta;
    if (axis === "x") groupRef.current.rotation.x += angle;
    if (axis === "y") groupRef.current.rotation.y += angle;
    if (axis === "z") groupRef.current.rotation.z += angle;
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!onPick) return;
    event.stopPropagation();
    const point = event.point;
    onPick([point.x, point.y, point.z]);
  };

  return (
    <group
      ref={groupRef}
      rotation={planeAligned ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}
      position={[offset || 0, 0, 0]}
      onPointerDown={handlePointerDown}
    >
      <primitive object={object} />
    </group>
  );
}

function SceneModel({
  url,
  transparent,
  smoothingEnabled,
  smoothingLevel,
  confidenceOverlay,
  planeAligned,
  rotationAxis,
  rotationSpeed,
  onBounds,
  onMetrics,
  onPick,
  offset = 0,
  heatmapReference,
  heatmapEnabled = false
}: {
  url: string;
  transparent: boolean;
  smoothingEnabled: boolean;
  smoothingLevel: number;
  confidenceOverlay: boolean;
  planeAligned: boolean;
  rotationAxis: RotationAxis;
  rotationSpeed: number;
  onBounds?: (sphere: THREE.Sphere) => void;
  onMetrics?: (metrics: SceneMetrics) => void;
  onPick?: (point: Point3) => void;
  offset?: number;
  heatmapReference?: BufferGeometry | null;
  heatmapEnabled?: boolean;
}) {
  const { scene } = useGLTF(url);

  const processedScene = useMemo(
    () =>
      prepareScene(
        scene,
        transparent,
        smoothingEnabled,
        smoothingLevel,
        confidenceOverlay,
        heatmapReference,
        heatmapEnabled
      ),
    [
      scene,
      transparent,
      smoothingEnabled,
      smoothingLevel,
      confidenceOverlay,
      heatmapReference,
      heatmapEnabled
    ]
  );

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(processedScene);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    onBounds?.(sphere);
    onMetrics?.(computeSceneMetrics(processedScene));
  }, [processedScene, onBounds, onMetrics]);

  return (
    <Bounds fit clip observe margin={1.15}>
      <RotatingObject
        object={processedScene}
        axis={rotationAxis}
        speed={rotationSpeed}
        planeAligned={planeAligned}
        offset={offset}
        onPick={onPick}
      />
    </Bounds>
  );
}

function MeasurementOverlays({ measurements, draftPoints }: { measurements: Measurement[]; draftPoints: Point3[] }) {
  return (
    <>
      {measurements.map((measurement) => {
        if (measurement.type === "distance" && measurement.points.length === 2) {
          return (
            <Line key={measurement.id} points={measurement.points} color="#0f4fcf" lineWidth={1.8} />
          );
        }
        if (measurement.type === "angle" && measurement.points.length === 3) {
          return (
            <group key={measurement.id}>
              <Line points={[measurement.points[0], measurement.points[1]]} color="#f59e0b" lineWidth={1.5} />
              <Line points={[measurement.points[1], measurement.points[2]]} color="#f59e0b" lineWidth={1.5} />
            </group>
          );
        }
        return null;
      })}
      {draftPoints.map((point, idx) => (
        <mesh key={`draft-${idx}`} position={point}>
          <sphereGeometry args={[0.8, 20, 20]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
      ))}
    </>
  );
}

function AnnotationPins({
  annotations,
  selectedId,
  onSelect
}: {
  annotations: AnnotationRecord[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {annotations.map((annotation) => (
        <group key={annotation.id} position={annotation.anchor}>
          <mesh onClick={() => onSelect(annotation.id)}>
            <sphereGeometry args={[1.1, 20, 20]} />
            <meshStandardMaterial
              color={ANNOTATION_COLORS[annotation.severity] || "#1d4ed8"}
              emissive={selectedId === annotation.id ? "#ffffff" : "#000000"}
              emissiveIntensity={selectedId === annotation.id ? 0.22 : 0}
            />
          </mesh>
          <Html distanceFactor={18} position={[0, 2.4, 0]}>
            <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow">
              {annotation.severity.toUpperCase()}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function makeCsv(measurements: Measurement[]): string {
  const header = ["id", "type", "label", "value", "unit", "created_at"];
  const rows = measurements.map((m) => [m.id, m.type, m.label, m.value, m.unit, m.createdAt]);
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function extractMainGeometry(scene: Object3D): BufferGeometry | null {
  let selected: BufferGeometry | null = null;
  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry || selected) return;
    selected = mesh.geometry.clone();
  });
  return selected;
}

function ComparisonScene({
  preUrl,
  postUrl,
  transparent,
  smoothingEnabled,
  smoothingLevel,
  planeAligned,
  rotationAxis,
  rotationSpeed,
  heatmapEnabled,
  onSummary
}: {
  preUrl: string;
  postUrl: string;
  transparent: boolean;
  smoothingEnabled: boolean;
  smoothingLevel: number;
  planeAligned: boolean;
  rotationAxis: RotationAxis;
  rotationSpeed: number;
  heatmapEnabled: boolean;
  onSummary: (summary: ComparisonSummary) => void;
}) {
  const pre = useGLTF(preUrl);
  const post = useGLTF(postUrl);

  const referenceGeometry = useMemo(() => extractMainGeometry(pre.scene), [pre.scene]);

  const preScene = useMemo(
    () => prepareScene(pre.scene, transparent, smoothingEnabled, smoothingLevel, false),
    [pre.scene, transparent, smoothingEnabled, smoothingLevel]
  );

  const postScene = useMemo(
    () =>
      prepareScene(
        post.scene,
        transparent,
        smoothingEnabled,
        smoothingLevel,
        false,
        referenceGeometry,
        heatmapEnabled
      ),
    [
      post.scene,
      transparent,
      smoothingEnabled,
      smoothingLevel,
      referenceGeometry,
      heatmapEnabled
    ]
  );

  useEffect(() => {
    const preMetrics = computeSceneMetrics(preScene);
    const postMetrics = computeSceneMetrics(postScene);

    const pct = (next: number, previous: number) => {
      if (Math.abs(previous) < 1e-6) return 0;
      return ((next - previous) / previous) * 100;
    };

    onSummary({
      areaDeltaPct: pct(postMetrics.area, preMetrics.area),
      volumeDeltaPct: pct(postMetrics.volume, preMetrics.volume),
      widthDeltaPct: pct(postMetrics.dimensions[0], preMetrics.dimensions[0]),
      heightDeltaPct: pct(postMetrics.dimensions[1], preMetrics.dimensions[1]),
      depthDeltaPct: pct(postMetrics.dimensions[2], preMetrics.dimensions[2])
    });
  }, [preScene, postScene, onSummary]);

  return (
    <Bounds fit clip observe margin={1.18}>
      <RotatingObject
        object={preScene}
        axis={rotationAxis}
        speed={rotationSpeed}
        planeAligned={planeAligned}
        offset={-90}
      />
      <RotatingObject
        object={postScene}
        axis={rotationAxis}
        speed={rotationSpeed}
        planeAligned={planeAligned}
        offset={90}
      />
    </Bounds>
  );
}

export function ModelViewer() {
  const searchParams = useSearchParams();

  const [transparent, setTransparent] = useState(false);
  const [modelId, setModelId] = useState(searchParams.get("model") || "1");
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [smoothingLevel, setSmoothingLevel] = useState(0.12);
  const [smoothingEnabled, setSmoothingEnabled] = useState(false);
  const [planeAligned, setPlaneAligned] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [lockAbovePlane, setLockAbovePlane] = useState(true);
  const [confidenceOverlay, setConfidenceOverlay] = useState(false);
  const [confidenceReport, setConfidenceReport] = useState<ConfidenceReport | null>(null);
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>("none");
  const [rotationSpeed, setRotationSpeed] = useState(0.5);
  const [toolMode, setToolMode] = useState<ToolMode>("none");
  const [draftPoints, setDraftPoints] = useState<Point3[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [sceneMetrics, setSceneMetrics] = useState<SceneMetrics | null>(null);
  const [boundsSphere, setBoundsSphere] = useState<THREE.Sphere | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<Point3 | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [annotationTitle, setAnnotationTitle] = useState("Review region");
  const [annotationComment, setAnnotationComment] = useState("");
  const [annotationSeverity, setAnnotationSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [compareMode, setCompareMode] = useState(false);
  const [compareModelId, setCompareModelId] = useState("");
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [compareSummary, setCompareSummary] = useState<ComparisonSummary | null>(null);
  const [differenceHeatmap, setDifferenceHeatmap] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);
  const compareObjectUrlRef = useRef<string | null>(null);

  const selectedAnnotation = annotations.find((item) => item.id === selectedAnnotationId) || null;

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (compareObjectUrlRef.current) URL.revokeObjectURL(compareObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const shared = searchParams.get("share");
    if (!shared) return;
    try {
      const decoded = JSON.parse(atob(shared)) as { annotations?: AnnotationRecord[]; modelId?: number };
      if (decoded.modelId) setModelId(String(decoded.modelId));
      if (decoded.annotations?.length) setAnnotations(decoded.annotations);
    } catch {
      setMessage("Share payload could not be decoded.");
    }
  }, [searchParams]);

  const setCameraView = useCallback((type: "top" | "side" | "oblique" | "reset" | "focus") => {
    const controls = controlsRef.current;
    if (!controls) return;

    const target = controls.target.clone();
    const radius = boundsSphere?.radius ? Math.max(boundsSphere.radius, 90) : 120;

    if (type === "focus" && selectedPoint) {
      target.set(selectedPoint[0], selectedPoint[1], selectedPoint[2]);
      controls.target.copy(target);
      controls.object.position.set(target.x + radius * 0.8, target.y + radius * 0.6, target.z + radius * 0.8);
      controls.update();
      return;
    }

    if (type === "top") {
      controls.target.copy(target);
      controls.object.position.set(target.x, target.y + radius * 1.8, target.z + radius * 0.001);
    }
    if (type === "side") {
      controls.target.copy(target);
      controls.object.position.set(target.x + radius * 1.7, target.y + radius * 0.5, target.z);
    }
    if (type === "oblique" || type === "reset") {
      controls.target.copy(target);
      controls.object.position.set(target.x + radius * 1.2, target.y + radius * 0.95, target.z + radius * 1.1);
    }
    controls.update();
  }, [boundsSphere, selectedPoint]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "1") setCameraView("top");
      if (event.key === "2") setCameraView("side");
      if (event.key === "3") setCameraView("oblique");
      if (event.key.toLowerCase() === "r") setCameraView("reset");
      if (event.key.toLowerCase() === "f") setCameraView("focus");
      if (event.key.toLowerCase() === "c") setConfidenceOverlay((prev) => !prev);
      if (event.key.toLowerCase() === "m") setToolMode("distance");
      if (event.key.toLowerCase() === "g") setToolMode("angle");
      if (event.key.toLowerCase() === "a") setToolMode("annotate");
      if (event.key === "Escape") {
        setToolMode("none");
        setDraftPoints([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCameraView]);

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

  const loadModel = async (id: number, asCompare = false) => {
    const response = await fetch(getModelFileUrl(id));
    if (!response.ok) throw new Error("Model not found or not ready.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (asCompare) {
      if (compareObjectUrlRef.current) URL.revokeObjectURL(compareObjectUrlRef.current);
      compareObjectUrlRef.current = url;
      setCompareUrl(url);
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setGltfUrl(url);
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
      await loadModel(parsedId);

      const report = await getModelConfidence(parsedId);
      setConfidenceReport(report as ConfidenceReport);

      const rows = await listAnnotations(parsedId).catch(() => []);
      setAnnotations(rows);
      setSelectedAnnotationId(rows[0]?.id || null);

      setStatus("idle");
      setMessage("Model loaded.");
      setCompareSummary(null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to load model.");
    }
  };

  const handleLoadCompare = async () => {
    const parsedId = Number(compareModelId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setMessage("Enter a valid comparison model ID.");
      return;
    }
    try {
      await loadModel(parsedId, true);
      setMessage("Comparison model loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load comparison model.");
    }
  };

  const addMeasurement = useCallback((measurement: Measurement) => {
    setMeasurements((prev) => [measurement, ...prev]);
  }, []);

  const handlePointPick = (point: Point3) => {
    setSelectedPoint(point);

    if (toolMode === "none") return;

    setDraftPoints((prev) => {
      const next = [...prev, point];
      if (toolMode === "distance" && next.length >= 2) {
        const distance = new THREE.Vector3(...next[0]).distanceTo(new THREE.Vector3(...next[1]));
        addMeasurement({
          id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "distance",
          value: distance,
          unit: "mm",
          label: `Distance (${formatNumber(distance)} mm)`,
          points: [next[0], next[1]],
          createdAt: new Date().toISOString()
        });
        return [];
      }

      if (toolMode === "angle" && next.length >= 3) {
        const a = new THREE.Vector3(...next[0]);
        const b = new THREE.Vector3(...next[1]);
        const c = new THREE.Vector3(...next[2]);
        const ba = a.clone().sub(b).normalize();
        const bc = c.clone().sub(b).normalize();
        const angle = THREE.MathUtils.radToDeg(ba.angleTo(bc));
        addMeasurement({
          id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "angle",
          value: angle,
          unit: "deg",
          label: `Angle (${formatNumber(angle)} deg)`,
          points: [next[0], next[1], next[2]],
          createdAt: new Date().toISOString()
        });
        return [];
      }

      if (toolMode === "annotate") {
        return [point];
      }

      return next;
    });
  };

  useEffect(() => {
    if (!sceneMetrics) return;
    const surfaceMeasurement: Measurement = {
      id: "surface-estimate",
      type: "surface",
      value: sceneMetrics.area,
      unit: "mm2",
      label: `Surface Area (${formatNumber(sceneMetrics.area)} mm2)`,
      points: [],
      createdAt: new Date().toISOString()
    };
    const volumeMeasurement: Measurement = {
      id: "volume-estimate",
      type: "volume",
      value: sceneMetrics.volume,
      unit: "mm3",
      label: `Volume (${formatNumber(sceneMetrics.volume)} mm3)`,
      points: [],
      createdAt: new Date().toISOString()
    };
    setMeasurements((prev) => {
      const filtered = prev.filter((item) => item.id !== "surface-estimate" && item.id !== "volume-estimate");
      return [volumeMeasurement, surfaceMeasurement, ...filtered];
    });
  }, [sceneMetrics]);

  const handleCreateAnnotation = async () => {
    const parsedId = Number(modelId);
    if (!draftPoints[0] || !Number.isFinite(parsedId)) return;

    try {
      const created = await createAnnotation(parsedId, {
        title: annotationTitle,
        severity: annotationSeverity,
        status: "open",
        anchor: draftPoints[0],
        comment: annotationComment
          ? {
              author: "clinician",
              message: annotationComment
            }
          : undefined
      });
      setAnnotations((prev) => [...prev, created]);
      setSelectedAnnotationId(created.id);
      setDraftPoints([]);
      setAnnotationComment("");
      setToolMode("none");
      setMessage("Annotation added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add annotation.");
    }
  };

  const handleUpdateAnnotation = async (
    annotationId: number,
    payload: { status?: "open" | "in_review" | "resolved"; severity?: "low" | "medium" | "high" | "critical" }
  ) => {
    const parsedId = Number(modelId);
    if (!Number.isFinite(parsedId)) return;
    try {
      const updated = await updateAnnotation(parsedId, annotationId, payload);
      setAnnotations((prev) => prev.map((item) => (item.id === annotationId ? updated : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update annotation.");
    }
  };

  const handleAddReply = async () => {
    const parsedId = Number(modelId);
    if (!selectedAnnotationId || !annotationComment.trim() || !Number.isFinite(parsedId)) return;
    try {
      const updated = await addAnnotationComment(parsedId, selectedAnnotationId, {
        author: "clinician",
        message: annotationComment.trim()
      });
      setAnnotations((prev) => prev.map((item) => (item.id === selectedAnnotationId ? updated : item)));
      setAnnotationComment("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add reply.");
    }
  };

  const handleDeleteAnnotation = async () => {
    const parsedId = Number(modelId);
    if (!selectedAnnotationId || !Number.isFinite(parsedId)) return;
    try {
      await deleteAnnotation(parsedId, selectedAnnotationId);
      setAnnotations((prev) => prev.filter((item) => item.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete annotation.");
    }
  };

  const handleExportMeasurements = () => {
    const csv = makeCsv(measurements.filter((item) => item.id !== "surface-estimate" && item.id !== "volume-estimate"));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `model-${modelId}-measurements.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyShare = async () => {
    const parsedId = Number(modelId);
    if (!Number.isFinite(parsedId)) return;
    const payload = {
      modelId: parsedId,
      annotations
    };
    const encoded = btoa(JSON.stringify(payload));
    const url = `${window.location.origin}/viewer?model=${parsedId}&share=${encodeURIComponent(encoded)}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1400);
  };

  const observedPct = Math.round((confidenceReport?.observed_ratio ?? 0) * 100);
  const adjustedPct = Math.round((confidenceReport?.adjusted_ratio ?? 0) * 100);
  const inferredPct = Math.round((confidenceReport?.inferred_ratio ?? 0) * 100);
  const overallPct = Math.round(
    ((confidenceReport?.overall_confidence ?? confidenceReport?.confidence ?? 0) as number) * 100
  );

  return (
    <div className="grid gap-7 lg:grid-cols-[2.2fr,1fr]">
      <div
        ref={viewerRef}
        className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft"
      >
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-ink">3D Reconstruction</p>
            <p className="text-xs text-slate-500">Top/side/oblique camera presets, keyboard shortcuts, and measurement workflow</p>
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
              className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                confidenceOverlay
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate"
              }`}
              onClick={() => setConfidenceOverlay((prev) => !prev)}
            >
              {confidenceOverlay ? "Confidence On" : "Confidence Off"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={() => setCompareMode((prev) => !prev)}
            >
              {compareMode ? "Single Model" : "Comparison"}
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button
              className="rounded-full bg-[#1f6feb] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#1f6feb]/30"
              onClick={handleLoad}
            >
              {status === "loading" ? "Loading..." : "Load Model"}
            </button>
          </div>
        </div>

        <div className={`${isFullscreen ? "h-[calc(100vh-92px)]" : "h-[620px]"} relative rounded-2xl border border-slate-200 bg-[#edf1f7]`}>
          <Canvas shadows camera={{ position: [250, 180, 220], fov: 36 }}>
            <color attach="background" args={["#edf1f7"]} />
            <ambientLight intensity={0.72} />
            <hemisphereLight args={["#f8fbff", "#c8d3e4", 0.55]} />
            <directionalLight castShadow position={[260, 340, 280]} intensity={2.1} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <directionalLight position={[-220, 150, -240]} intensity={1.0} />
            <Environment preset="studio" />

            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -9.5, 0]}>
              <planeGeometry args={[1600, 1600]} />
              <meshStandardMaterial color="#97a7bf" roughness={0.9} metalness={0} />
            </mesh>
            <gridHelper args={[1100, 40, "#a4b5cc", "#bac8dc"]} position={[0, -9.4, 0]} />

            {compareMode && gltfUrl && compareUrl ? (
              <ComparisonScene
                preUrl={gltfUrl}
                postUrl={compareUrl}
                transparent={transparent}
                smoothingEnabled={smoothingEnabled}
                smoothingLevel={smoothingLevel}
                planeAligned={planeAligned}
                rotationAxis={rotationAxis}
                rotationSpeed={rotationSpeed}
                heatmapEnabled={differenceHeatmap}
                onSummary={setCompareSummary}
              />
            ) : null}

            {!compareMode && gltfUrl ? (
              <SceneModel
                url={gltfUrl}
                transparent={transparent}
                smoothingEnabled={smoothingEnabled}
                smoothingLevel={smoothingLevel}
                confidenceOverlay={confidenceOverlay}
                planeAligned={planeAligned}
                rotationAxis={rotationAxis}
                rotationSpeed={rotationSpeed}
                onBounds={setBoundsSphere}
                onMetrics={setSceneMetrics}
                onPick={handlePointPick}
              />
            ) : null}

            {!compareMode && !gltfUrl ? (
              <mesh>
                <sphereGeometry args={[18, 64, 64]} />
                <meshStandardMaterial color="#dbe8fb" />
              </mesh>
            ) : null}

            {!compareMode ? <MeasurementOverlays measurements={measurements} draftPoints={draftPoints} /> : null}
            {!compareMode ? (
              <AnnotationPins
                annotations={annotations}
                selectedId={selectedAnnotationId}
                onSelect={setSelectedAnnotationId}
              />
            ) : null}

            {showAxes ? <axesHelper args={[60]} /> : null}
            <ContactShadows position={[0, -9.35, 0]} opacity={0.35} scale={420} blur={1.4} far={220} />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.07}
              rotateSpeed={0.78}
              zoomSpeed={0.9}
              panSpeed={0.86}
              minDistance={45}
              maxDistance={640}
              minPolarAngle={0.03}
              maxPolarAngle={lockAbovePlane ? Math.PI * 0.5 : Math.PI - 0.03}
            />

            <GizmoHelper alignment="bottom-right" margin={[84, 84]}>
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
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">Camera Presets</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setCameraView("top")}>Top</button>
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setCameraView("side")}>Side</button>
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setCameraView("oblique")}>Oblique</button>
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setCameraView("reset")}>Reset</button>
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setCameraView("focus")}>Focus</button>
                <button className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" onClick={() => setShowAxes((prev) => !prev)}>
                  {showAxes ? "Hide Axes" : "Show Axes"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate/60">
                Smoothing ({Math.round(smoothingLevel * 100)}%)
              </p>
              <input
                className="mt-2 w-full accent-[#1f6feb]"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={smoothingLevel}
                onChange={(event) => setSmoothingLevel(Number(event.target.value))}
              />
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
                className="mt-2 w-full accent-[#1f6feb]"
                type="range"
                min={0.1}
                max={2.5}
                step={0.1}
                value={rotationSpeed}
                onChange={(event) => setRotationSpeed(Number(event.target.value))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button className="rounded-xl border border-slate-200 px-2 py-1.5" onClick={() => setPlaneAligned((prev) => !prev)}>
                {planeAligned ? "Plane Aligned" : "Vertical"}
              </button>
              <button className="rounded-xl border border-slate-200 px-2 py-1.5" onClick={() => setLockAbovePlane((prev) => !prev)}>
                {lockAbovePlane ? "Above-Plane Lock" : "Free Orbit"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Measurement Toolkit</p>
            <button className="text-xs font-semibold text-[#1f6feb]" onClick={handleExportMeasurements}>Export CSV</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <button className={`rounded-xl border px-2 py-1.5 ${toolMode === "distance" ? "border-[#1f6feb] bg-[#e8f0ff]" : "border-slate-200"}`} onClick={() => { setToolMode("distance"); setDraftPoints([]); }}>Distance</button>
            <button className={`rounded-xl border px-2 py-1.5 ${toolMode === "angle" ? "border-[#1f6feb] bg-[#e8f0ff]" : "border-slate-200"}`} onClick={() => { setToolMode("angle"); setDraftPoints([]); }}>Angle</button>
            <button className="rounded-xl border border-slate-200 px-2 py-1.5" onClick={() => { setToolMode("none"); setDraftPoints([]); }}>Stop</button>
          </div>
          <div className="mt-3 max-h-40 space-y-2 overflow-auto rounded-xl border border-slate-100 p-2">
            {measurements.length === 0 ? <p className="text-xs text-slate">No measurements yet.</p> : null}
            {measurements.map((measurement) => (
              <div key={measurement.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
                <p className="font-semibold text-slate-700">{measurement.label}</p>
                <p className="text-[11px] text-slate-500">{new Date(measurement.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Annotation System</p>
            <button className={`rounded-xl border px-3 py-1 text-xs ${toolMode === "annotate" ? "border-[#1f6feb] bg-[#e8f0ff]" : "border-slate-200"}`} onClick={() => { setToolMode("annotate"); setDraftPoints([]); }}>Pin Mode</button>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Annotation title"
              value={annotationTitle}
              onChange={(event) => setAnnotationTitle(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={annotationSeverity}
              onChange={(event) => setAnnotationSeverity(event.target.value as "low" | "medium" | "high" | "critical")}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              rows={3}
              placeholder="Comment or reply"
              value={annotationComment}
              onChange={(event) => setAnnotationComment(event.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="rounded-xl bg-[#1f6feb] px-3 py-2 text-xs font-semibold text-white"
                onClick={handleCreateAnnotation}
                disabled={toolMode !== "annotate" || draftPoints.length === 0}
              >
                Create Annotation
              </button>
              <button className="rounded-xl border border-slate-200 px-3 py-2" onClick={handleAddReply} disabled={!selectedAnnotationId || !annotationComment.trim()}>
                Add Reply
              </button>
            </div>
            <button className="rounded-xl border border-slate-200 px-3 py-2" onClick={handleCopyShare}>
              {shareCopied ? "Share Link Copied" : "Copy Share Link"}
            </button>
          </div>

          <div className="mt-3 max-h-40 space-y-2 overflow-auto rounded-xl border border-slate-100 p-2">
            {annotations.map((annotation) => (
              <div key={annotation.id} className={`rounded-lg border px-2 py-1 text-xs ${selectedAnnotationId === annotation.id ? "border-[#1f6feb] bg-[#e8f0ff]" : "border-slate-100 bg-white"}`}>
                <button className="w-full text-left" onClick={() => setSelectedAnnotationId(annotation.id)}>
                  <p className="font-semibold text-slate-700">{annotation.title}</p>
                  <p className="text-[11px] text-slate-500">{annotation.severity} • {annotation.status}</p>
                </button>
                {selectedAnnotationId === annotation.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border border-slate-200 px-2 py-1" onClick={() => handleUpdateAnnotation(annotation.id, { status: "resolved" })}>Resolve</button>
                    <button className="rounded border border-slate-200 px-2 py-1" onClick={() => handleUpdateAnnotation(annotation.id, { status: "in_review" })}>In Review</button>
                    <button className="rounded border border-red-200 px-2 py-1 text-red-600" onClick={handleDeleteAnnotation}>Delete</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {selectedAnnotation ? (
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
              <p className="font-semibold text-slate-700">Thread</p>
              <div className="mt-1 max-h-24 space-y-1 overflow-auto">
                {selectedAnnotation.comments.map((comment) => (
                  <p key={comment.id} className="text-[11px] text-slate-600">
                    <span className="font-semibold">{comment.author}:</span> {comment.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Comparison Mode</p>
            <label className="flex items-center gap-2 text-xs text-slate">
              <input type="checkbox" checked={differenceHeatmap} onChange={(event) => setDifferenceHeatmap(event.target.checked)} />
              Heatmap
            </label>
          </div>
          <div className="mt-3 grid grid-cols-[1fr,auto] gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              placeholder="Post-op model ID"
              value={compareModelId}
              onChange={(event) => setCompareModelId(event.target.value)}
            />
            <button className="rounded-xl bg-[#1f6feb] px-3 py-2 text-xs font-semibold text-white" onClick={handleLoadCompare}>Load</button>
          </div>
          {compareSummary ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <p>Area delta: <span className="font-semibold">{formatNumber(compareSummary.areaDeltaPct)}%</span></p>
              <p>Volume delta: <span className="font-semibold">{formatNumber(compareSummary.volumeDeltaPct)}%</span></p>
              <p>Width delta: <span className="font-semibold">{formatNumber(compareSummary.widthDeltaPct)}%</span></p>
              <p>Height delta: <span className="font-semibold">{formatNumber(compareSummary.heightDeltaPct)}%</span></p>
              <p>Depth delta: <span className="font-semibold">{formatNumber(compareSummary.depthDeltaPct)}%</span></p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate">Load a post-op model to see side-by-side deltas.</p>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Confidence Overlay</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate">
              {overallPct}% overall
            </span>
          </div>
          <p className="mt-2 text-xs text-slate/80">
            Blue = directly supported, amber = adjusted interpolation, magenta = inferred fill.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONFIDENCE_COLORS.observed }} />
                  <span className="text-slate">Observed</span>
                </div>
                <span className="font-semibold text-ink">{observedPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full" style={{ width: `${observedPct}%`, background: CONFIDENCE_COLORS.observed }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONFIDENCE_COLORS.adjusted }} />
                  <span className="text-slate">Adjusted</span>
                </div>
                <span className="font-semibold text-ink">{adjustedPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full" style={{ width: `${adjustedPct}%`, background: CONFIDENCE_COLORS.adjusted }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CONFIDENCE_COLORS.inferred }} />
                  <span className="text-slate">Inferred</span>
                </div>
                <span className="font-semibold text-ink">{inferredPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full" style={{ width: `${inferredPct}%`, background: CONFIDENCE_COLORS.inferred }} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate/70">Confidence mode: {confidenceReport?.mode ?? "n/a"}</p>
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
            Keyboard shortcuts: 1 top, 2 side, 3 oblique, R reset, F focus, M distance, G angle, A annotate, Esc stop tool.
          </p>
        </div>

        <div className="rounded-3xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
          Not diagnostic: this viewer is for planning and education support only.
        </div>
      </div>
    </div>
  );
}
