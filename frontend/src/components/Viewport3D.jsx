/**
 * ShellForge — Viewport3D
 * Full 3D viewport with TransformControls, STL loading, view modes, cutout visualization.
 *
 * Coordinate system mapping:
 *   Engineering (state): X=right, Y=front-back, Z=up
 *   Three.js scene:       X=right, Y=up,         Z=front-back
 *   Mapping: threePos = [comp.x, comp.ground_z + comp.height/2, comp.y]
 */
import { useRef, useState, useMemo, Suspense, useEffect, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";

// ── Palette & connector profiles ─────────────────────────────────────────────

const PALETTE = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#38bdf8"];

const CONNECTOR_PROFILES = {
  usb_c:       { w: 9.3,  h: 3.8  },
  usb_a:       { w: 13,   h: 6.5  },
  micro_usb:   { w: 8,    h: 3.5  },
  hdmi:        { w: 16,   h: 7.5  },
  jack_3_5:    { w: 6.5,  h: 6.5  },
  barrel_jack: { w: 8.5,  h: 8.5  },
  rj45:        { w: 16.5, h: 13.5 },
};

// ── Helper: compute enclosure bbox from components + config ───────────────────

function computeEnclosureBbox(components, config) {
  const visible = components.filter((c) => c.visible !== false);
  if (!visible.length) return null;

  const pad_x = config.padding_x ?? 3;
  const pad_y = config.padding_y ?? 3;
  const pad_z = config.padding_z ?? 3;
  const wall  = config.wall_thickness ?? 2.5;
  const floor = config.floor_thickness ?? 2.5;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of visible) {
    const cx = c.x ?? 0, cy = c.y ?? 0, cz = c.ground_z ?? c.z ?? 0;
    minX = Math.min(minX, cx - c.width / 2);
    maxX = Math.max(maxX, cx + c.width / 2);
    minY = Math.min(minY, cy - c.depth / 2);
    maxY = Math.max(maxY, cy + c.depth / 2);
    minZ = Math.min(minZ, cz);
    maxZ = Math.max(maxZ, cz + c.height);
  }
  const innerW = (maxX - minX) + pad_x * 2;
  const innerD = (maxY - minY) + pad_y * 2;
  const innerH = (maxZ - minZ) + pad_z * 2;
  return {
    w: innerW + wall * 2,
    d: innerD + wall * 2,
    h: innerH + floor,
  };
}

// ── STL Mesh content ──────────────────────────────────────────────────────────

function STLContent({ url, color, viewMode }) {
  const geometry = useLoader(STLLoader, url);
  useEffect(() => {
    if (geometry) {
      geometry.computeBoundingBox();
      geometry.center();
      geometry.computeVertexNormals();
    }
  }, [geometry]);

  return (
    <>
      {(viewMode === "solid" || viewMode === "both") && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} transparent opacity={0.75} />
        </mesh>
      )}
      {(viewMode === "wireframe" || viewMode === "both") && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color={color} wireframe />
        </mesh>
      )}
    </>
  );
}

// ── Box content ───────────────────────────────────────────────────────────────

function BoxContent({ width, height, depth, color, viewMode }) {
  return (
    <>
      {(viewMode === "solid" || viewMode === "both") && (
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color={color} transparent opacity={0.7} />
        </mesh>
      )}
      {(viewMode === "wireframe" || viewMode === "both") && (
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
      )}
    </>
  );
}

// ── Elevation dashed line (ground_z indicator) ────────────────────────────────

function ElevationLine({ x, z, groundZ, color }) {
  if (!groundZ || groundZ <= 0) return null;

  const points = useMemo(() => {
    // In Three.js: Y is up, X is right, Z is front-back
    // Component ground is at threeY = groundZ, floor is at threeY = 0
    return [
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, groundZ, z),
    ];
  }, [x, z, groundZ]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  return (
    <line geometry={geometry}>
      <lineDashedMaterial color={color} dashSize={2} gapSize={1} linewidth={1} />
    </line>
  );
}

// ── Single component in scene ─────────────────────────────────────────────────

function ComponentObject({
  comp, colorIndex, viewMode, isSelected,
  onSelect, onMove, setOrbitEnabled, transformMode,
}) {
  const color = PALETTE[colorIndex % PALETTE.length];
  const groupRef = useRef();
  const [isDragging, setIsDragging] = useState(false);

  const threeX = comp.x ?? 0;
  const threeY = (comp.ground_z ?? 0) + comp.height / 2;
  const threeZ = comp.y ?? 0;
  const rotY   = comp.rotY ?? 0;

  // Sync position from state (only when not dragging)
  useEffect(() => {
    if (!isDragging && groupRef.current) {
      groupRef.current.position.set(threeX, threeY, threeZ);
      groupRef.current.rotation.set(0, rotY, 0);
    }
  }, [threeX, threeY, threeZ, rotY, isDragging]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
    setOrbitEnabled(false);
  }, [setOrbitEnabled]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setOrbitEnabled(true);
    if (groupRef.current) {
      const p = groupRef.current.position;
      const r = groupRef.current.rotation;
      onMove(comp.id, {
        x: p.x,
        y: p.z,              // Three.js Z → engineering Y
        ground_z: Math.max(0, p.y - comp.height / 2),  // Three.js Y → ground_z
        rotY: r.y,
      });
    }
  }, [comp.id, comp.height, onMove, setOrbitEnabled]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onSelect(comp.id);
  }, [comp.id, onSelect]);

  if (!comp.visible) return null;

  const content = comp.stl_url ? (
    <Suspense
      fallback={
        <mesh>
          <boxGeometry args={[comp.width, comp.height, comp.depth]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
      }
    >
      <STLContent url={comp.stl_url} color={color} viewMode={viewMode} />
    </Suspense>
  ) : (
    <BoxContent
      width={comp.width}
      height={comp.height}
      depth={comp.depth}
      color={color}
      viewMode={viewMode}
    />
  );

  return (
    <>
      {/* Elevation indicator line */}
      <ElevationLine
        x={threeX}
        z={threeZ}
        groundZ={comp.ground_z ?? 0}
        color={color}
      />

      {/* The actual mesh group */}
      <group ref={groupRef} onClick={handleClick}>
        {content}
        {isSelected && (
          <mesh>
            <boxGeometry args={[comp.width + 1, comp.height + 1, comp.depth + 1]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </group>

      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          showY={transformMode === "translate"}
        />
      )}
    </>
  );
}

// ── Cutout visualization on enclosure walls ───────────────────────────────────

function CutoutBox({ cutout, enclosure, isSelected, onSelect }) {
  if (!enclosure) return null;

  const profile = CONNECTOR_PROFILES[cutout.connector_type] || { w: 10, h: 5 };
  const cw = profile.w;
  const ch = profile.h;
  const thickness = 2;
  const halfW = enclosure.w / 2;
  const halfD = enclosure.d / 2;
  const halfH = enclosure.h / 2;
  const centerY = halfH;

  const ox = cutout.offset_x ?? 0;
  const oy = cutout.offset_y ?? 0;

  let position, rotation, dims;
  switch (cutout.face) {
    case "front":
      position = [ox, centerY + oy, halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
      break;
    case "back":
      position = [ox, centerY + oy, -halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
      break;
    case "left":
      position = [-halfW, centerY + oy, ox];
      rotation = [0, Math.PI / 2, 0];
      dims = [cw, ch, thickness];
      break;
    case "right":
      position = [halfW, centerY + oy, ox];
      rotation = [0, Math.PI / 2, 0];
      dims = [cw, ch, thickness];
      break;
    default:
      position = [ox, centerY + oy, halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
  }

  const color = isSelected ? "#facc15" : "#94a3b8";
  return (
    <mesh
      position={position}
      rotation={rotation}
      onClick={(e) => { e.stopPropagation(); onSelect(cutout.id); }}
    >
      <boxGeometry args={dims} />
      <meshStandardMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

// ── Custom cutout visualization ───────────────────────────────────────────────

function CustomCutoutMesh({ cutout, enclosure, isSelected, onSelect }) {
  if (!enclosure) return null;

  const w = cutout.width ?? 10;
  const h = cutout.height ?? 10;
  const thickness = 2;
  const halfW = enclosure.w / 2;
  const halfD = enclosure.d / 2;
  const halfH = enclosure.h / 2;
  const centerY = halfH;
  const ox = cutout.offset_x ?? 0;
  const oy = cutout.offset_y ?? 0;

  let position, rotation;
  switch (cutout.face) {
    case "front":
      position = [ox, centerY + oy, halfD + 0.5];
      rotation = [0, 0, 0];
      break;
    case "back":
      position = [ox, centerY + oy, -halfD - 0.5];
      rotation = [0, 0, 0];
      break;
    case "left":
      position = [-halfW - 0.5, centerY + oy, ox];
      rotation = [0, Math.PI / 2, 0];
      break;
    case "right":
      position = [halfW + 0.5, centerY + oy, ox];
      rotation = [0, Math.PI / 2, 0];
      break;
    default:
      position = [ox, centerY + oy, halfD + 0.5];
      rotation = [0, 0, 0];
  }

  const color = isSelected ? "#fbbf24" : "#f59e0b";

  // Choose geometry based on shape
  const shape = cutout.shape;
  let geo;
  if (shape === "circle") {
    // Render as ring outline
    const ringGeo = new THREE.RingGeometry(w / 2 - 0.5, w / 2, 32);
    geo = <primitive object={ringGeo} />;
    return (
      <mesh
        position={position}
        rotation={rotation}
        onClick={(e) => { e.stopPropagation(); onSelect && onSelect(cutout.id); }}
      >
        <primitive object={ringGeo} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  // For rectangle, hexagon, triangle: use box or line geometry
  return (
    <mesh
      position={position}
      rotation={rotation}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(cutout.id); }}
    >
      <boxGeometry args={[w, h, thickness]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.75}
        wireframe={shape !== "rectangle"}
      />
    </mesh>
  );
}

// ── Enclosure wireframe box ───────────────────────────────────────────────────

function EnclosureBox({ enclosure }) {
  if (!enclosure) return null;
  return (
    <mesh position={[0, enclosure.h / 2, 0]}>
      <boxGeometry args={[enclosure.w, enclosure.h, enclosure.d]} />
      <meshBasicMaterial color="#4ade80" wireframe />
    </mesh>
  );
}

// ── Camera frame-all helper ───────────────────────────────────────────────────

function CameraFramer({ triggerFrame, enclosure }) {
  const { camera } = useThree();
  const prevTrigger = useRef(0);

  useEffect(() => {
    if (triggerFrame === 0 || triggerFrame === prevTrigger.current) return;
    prevTrigger.current = triggerFrame;

    let distance = 150;
    let target = new THREE.Vector3(0, 0, 0);

    if (enclosure) {
      const maxDim = Math.max(enclosure.w, enclosure.d, enclosure.h);
      distance = maxDim * 2;
      target.set(0, enclosure.h / 2, 0);
    }

    camera.position.set(
      target.x + distance * 0.6,
      target.y + distance * 0.4,
      target.z + distance * 0.6
    );
    camera.lookAt(target);
  }, [triggerFrame, enclosure, camera]);

  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({
  components, cutouts, customCutouts, config,
  selectedId, selectedType,
  onSelectComponent, onSelectCutout, onSelectCustomCutout,
  onComponentMove, viewMode, transformMode,
  triggerFrame,
}) {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const enclosure = useMemo(
    () => computeEnclosureBbox(components, config),
    [components, config]
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 80, 50]} intensity={1} />
      <directionalLight position={[-30, 40, -20]} intensity={0.4} />

      {/* Components */}
      {components.map((comp, i) => (
        <ComponentObject
          key={comp.id}
          comp={comp}
          colorIndex={i}
          viewMode={viewMode}
          isSelected={selectedId === comp.id && selectedType === "component"}
          onSelect={onSelectComponent}
          onMove={onComponentMove}
          setOrbitEnabled={setOrbitEnabled}
          transformMode={transformMode}
        />
      ))}

      {/* Enclosure outline */}
      {enclosure && <EnclosureBox enclosure={enclosure} />}

      {/* Connector cutout boxes on walls */}
      {enclosure && cutouts.map((co) => (
        <CutoutBox
          key={co.id}
          cutout={co}
          enclosure={enclosure}
          isSelected={selectedId === co.id && selectedType === "cutout"}
          onSelect={onSelectCutout}
        />
      ))}

      {/* Custom cutouts on walls */}
      {enclosure && customCutouts && customCutouts.map((cc) => (
        <CustomCutoutMesh
          key={cc.id}
          cutout={cc}
          enclosure={enclosure}
          isSelected={selectedId === cc.id && selectedType === "customCutout"}
          onSelect={onSelectCustomCutout}
        />
      ))}

      {/* Grid floor */}
      <Grid
        position={[0, 0, 0]}
        args={[300, 300]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={20}
        sectionThickness={1}
        sectionColor="#2a2a4e"
        fadeDistance={300}
        infiniteGrid
      />

      <axesHelper args={[30]} />

      <OrbitControls makeDefault enabled={orbitEnabled} dampingFactor={0.1} />

      <CameraFramer triggerFrame={triggerFrame} enclosure={enclosure} />
    </>
  );
}

// ── ViewToolbar ───────────────────────────────────────────────────────────────

function ViewToolbar({ viewMode, setViewMode, transformMode, setTransformMode, onFrameAll }) {
  return (
    <div className="view-toolbar">
      <div className="toolbar-group">
        {["solid", "wireframe", "both"].map((m) => (
          <button
            key={m}
            className={`toolbar-btn${viewMode === m ? " active" : ""}`}
            onClick={() => setViewMode(m)}
          >
            {m === "both" ? "Both" : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${transformMode === "translate" ? " active" : ""}`}
          onClick={() => setTransformMode("translate")}
          title="Move selected component"
        >
          Move
        </button>
        <button
          className={`toolbar-btn${transformMode === "rotate" ? " active" : ""}`}
          onClick={() => setTransformMode("rotate")}
          title="Rotate selected component"
        >
          Rotate
        </button>
      </div>
      <button className="toolbar-btn frame-btn" onClick={onFrameAll} title="Reset camera to fit all">
        Frame
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Viewport3D({
  components, cutouts, customCutouts, config,
  selectedId, selectedType,
  onSelectComponent, onSelectCutout, onSelectCustomCutout, onComponentMove,
  viewMode, setViewMode,
  transformMode, setTransformMode,
}) {
  const [frameCounter, setFrameCounter] = useState(0);

  return (
    <div className="viewport-wrapper">
      <ViewToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        onFrameAll={() => setFrameCounter((c) => c + 1)}
      />
      <div className="viewer-wrapper">
        <div className="viewer-label">3D Preview</div>
        <Canvas
          camera={{ position: [80, 60, 80], fov: 45 }}
          style={{ background: "#0a0a0d" }}
          onPointerMissed={() => onSelectComponent(null)}
        >
          <Scene
            components={components}
            cutouts={cutouts}
            customCutouts={customCutouts || []}
            config={config}
            selectedId={selectedId}
            selectedType={selectedType}
            onSelectComponent={onSelectComponent}
            onSelectCutout={onSelectCutout}
            onSelectCustomCutout={onSelectCustomCutout}
            onComponentMove={onComponentMove}
            viewMode={viewMode}
            transformMode={transformMode}
            triggerFrame={frameCounter}
          />
        </Canvas>
        {components.length === 0 && (
          <div className="viewer-empty">Add components to see the preview</div>
        )}
      </div>
    </div>
  );
}
