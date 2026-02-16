/**
 * ShellForge - 3D Viewport
 * Shows a live preview of the components and the enclosure bounding box
 * using React Three Fiber (Three.js).
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useMemo } from "react";

const COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399"];

/**
 * Single component box (translucent)
 */
function ComponentBox({ component, colorIndex }) {
  const color = COLORS[colorIndex % COLORS.length];
  const { width, depth, height, x = 0, y = 0, z = 0 } = component;

  return (
    <group position={[x, z + height / 2, y]}>
      {/* Solid slightly transparent box */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {/* Wireframe outline */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    </group>
  );
}

/**
 * Enclosure outline box (shows the generated shell boundaries)
 */
function EnclosureBox({ components, config }) {
  const box = useMemo(() => {
    if (!components.length) return null;

    const pad_x = config.padding_x ?? 3;
    const pad_y = config.padding_y ?? 3;
    const pad_z = config.padding_z ?? 3;
    const wall = config.wall_thickness ?? 2.5;
    const floor = config.floor_thickness ?? 2.5;

    // Compute combined bbox
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const c of components) {
      const x = c.x ?? 0, y = c.y ?? 0, z = c.z ?? 0;
      minX = Math.min(minX, x - c.width / 2);
      maxX = Math.max(maxX, x + c.width / 2);
      minY = Math.min(minY, y - c.depth / 2);
      maxY = Math.max(maxY, y + c.depth / 2);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z + c.height);
    }

    const innerW = (maxX - minX) + pad_x * 2;
    const innerD = (maxY - minY) + pad_y * 2;
    const innerH = (maxZ - minZ) + pad_z * 2;
    const outerW = innerW + wall * 2;
    const outerD = innerD + wall * 2;
    const outerH = innerH + floor;

    return { w: outerW, d: outerD, h: outerH };
  }, [components, config]);

  if (!box) return null;

  return (
    <group position={[0, box.h / 2, 0]}>
      <mesh>
        <boxGeometry args={[box.w, box.h, box.d]} />
        <meshBasicMaterial color="#4ade80" wireframe />
      </mesh>
    </group>
  );
}

/**
 * Axis labels (X Y Z arrows)
 */
function AxisHelper() {
  return <axesHelper args={[30]} />;
}

export default function EnclosureViewer({ components, config }) {
  const hasComponents = components.length > 0;

  return (
    <div className="viewer-wrapper">
      <div className="viewer-label">3D Preview</div>
      <Canvas
        camera={{ position: [80, 60, 80], fov: 45 }}
        style={{ background: "#0a0a0d", borderRadius: "8px" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 80, 50]} intensity={1} />

        {/* Component boxes */}
        {components.map((comp, i) => (
          <ComponentBox key={i} component={comp} colorIndex={i} />
        ))}

        {/* Enclosure outline */}
        {hasComponents && <EnclosureBox components={components} config={config} />}

        {/* Grid floor */}
        <Grid
          position={[0, 0, 0]}
          args={[200, 200]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#1a1a2e"
          sectionSize={20}
          sectionThickness={1}
          sectionColor="#2a2a4e"
          fadeDistance={200}
          infiniteGrid
        />

        <AxisHelper />
        <OrbitControls makeDefault dampingFactor={0.1} />
      </Canvas>

      {!hasComponents && (
        <div className="viewer-empty">
          Add components to see the preview
        </div>
      )}
    </div>
  );
}
