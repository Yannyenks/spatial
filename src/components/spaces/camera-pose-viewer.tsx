"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Deliberately minimal — vanilla three.js, not a full splat/mesh renderer
// (that needs a real 3D reconstruction engine, docs/rd-blueprint-classification.md).
// This exists so CameraPose rows — written by every reconstruction engine
// since the mock, but never read or displayed anywhere until now — are
// actually visible: literal position/orientation markers in 3D space, real
// enough to show whether a placeholder ring or genuine measured poses
// (real-tier-roadmap.md step B1) produced them.
const VIEWER_HEIGHT = 320;
const PLACEHOLDER_COLOR = 0x94a3b8; // slate — synthesized ring, not measured
const REAL_COLOR = 0x22c55e; // green — real, measured poses (e.g. COLMAP)

export interface CameraPoseViewerPose {
  id: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  order: number;
}

export function CameraPoseViewer({
  poses,
  source,
}: {
  poses: CameraPoseViewerPose[];
  source: "placeholder" | "real";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || poses.length === 0) return;

    const width = container.clientWidth;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115);

    const camera = new THREE.PerspectiveCamera(50, width / VIEWER_HEIGHT, 0.05, 200);
    camera.position.set(4, 4, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, VIEWER_HEIGHT);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.update();

    scene.add(new THREE.GridHelper(10, 20, 0x475569, 0x1e293b));
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    const color = source === "real" ? REAL_COLOR : PLACEHOLDER_COLOR;
    const positions: THREE.Vector3[] = [];
    const coneGeometry = new THREE.ConeGeometry(0.12, 0.3, 8);
    const material = new THREE.MeshStandardMaterial({ color });

    for (const pose of poses) {
      const mesh = new THREE.Mesh(coneGeometry, material);
      mesh.position.set(pose.positionX, pose.positionY, pose.positionZ);
      // A cone points along +Y by default; rotate so it points along -Z
      // (the camera's forward axis) before applying the pose's own
      // orientation, so it reads as "a camera facing somewhere" rather
      // than an arbitrary upward spike.
      mesh.rotation.set(pose.rotationX + Math.PI / 2, pose.rotationY, pose.rotationZ);
      scene.add(mesh);
      positions.push(new THREE.Vector3(pose.positionX, pose.positionY, pose.positionZ));
    }

    if (positions.length > 1) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(positions);
      scene.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x64748b })));
    }

    let frameId = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / VIEWER_HEIGHT;
      camera.updateProjectionMatrix();
      renderer.setSize(w, VIEWER_HEIGHT);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      coneGeometry.dispose();
      material.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [poses, source]);

  if (poses.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">No camera poses yet — process this space first.</p>;
  }

  return (
    <div>
      <div ref={containerRef} className="w-full overflow-hidden rounded-[var(--radius-md)]" style={{ height: VIEWER_HEIGHT }} />
      <p className="mt-2 text-xs text-[var(--fg-muted)]">
        {source === "real"
          ? "Real, measured camera positions (structure-from-motion)."
          : "Synthesized placeholder positions — not yet measured from the actual photos."}
      </p>
    </div>
  );
}
