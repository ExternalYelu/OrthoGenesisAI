"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, OrbitControls, MeshDistortMaterial } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";

function BoneShape() {
  const mesh = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    mesh.current.rotation.y = t * 0.2;
    mesh.current.rotation.x = Math.sin(t * 0.15) * 0.15;
    mesh.current.rotation.z = Math.cos(t * 0.1) * 0.05;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={mesh} castShadow receiveShadow>
        <torusKnotGeometry args={[0.8, 0.32, 200, 32, 2, 3]} />
        <MeshDistortMaterial
          color="#E8EFF8"
          roughness={0.28}
          metalness={0.06}
          distort={0.15}
          speed={1.8}
          envMapIntensity={0.4}
        />
      </mesh>
    </Float>
  );
}

function GlowRing() {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    ref.current.rotation.z = state.clock.elapsedTime * 0.08;
  });

  return (
    <mesh ref={ref} position={[0, 0, -0.5]}>
      <torusGeometry args={[1.8, 0.005, 16, 100]} />
      <meshBasicMaterial color="#2E7DF6" transparent opacity={0.18} />
    </mesh>
  );
}

function GridFloor() {
  const grid = useMemo(() => {
    const geo = new THREE.PlaneGeometry(12, 12, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: "#2E7DF6",
      wireframe: true,
      transparent: true,
      opacity: 0.04
    });
    return { geo, mat };
  }, []);

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -1.6, 0]} geometry={grid.geo} material={grid.mat} />
  );
}

export function BonePreview() {
  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-[#f0f5fc] via-[#f7fafd] to-[#eef6f5]">
      <div className="absolute inset-0 bg-hero-mesh" />
      <Canvas camera={{ position: [3.5, 2, 3.5], fov: 36 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.0} castShadow shadow-mapSize={1024} />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#2AC7B0" />
        <pointLight position={[0, 3, 0]} intensity={0.2} color="#2E7DF6" />
        <BoneShape />
        <GlowRing />
        <GridFloor />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.4}
          maxPolarAngle={Math.PI / 1.8}
          minPolarAngle={Math.PI / 4}
        />
        <Environment preset="city" environmentIntensity={0.3} />
      </Canvas>
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-teal" />
        <span className="text-[11px] font-medium text-slate/40">Live 3D Preview</span>
      </div>
    </div>
  );
}
