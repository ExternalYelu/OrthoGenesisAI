"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function Bone() {
  const mesh = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    mesh.current.rotation.y = state.clock.elapsedTime * 0.3;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.2;
  });

  return (
    <mesh ref={mesh}>
      <cylinderGeometry args={[0.65, 0.85, 2.6, 40, 10]} />
      <meshStandardMaterial color="#E6EEF7" roughness={0.35} metalness={0.1} />
    </mesh>
  );
}

export function BonePreview() {
  return (
    <div className="h-[360px] w-full rounded-3xl bg-grid-fade p-4 shadow-soft">
      <Canvas camera={{ position: [3, 2, 3], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <Bone />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}


