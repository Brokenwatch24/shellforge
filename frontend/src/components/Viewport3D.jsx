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
  onSelect, onMove, setOrbitEnabled, transformMode, snapSize,
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
      // Apply grid snap if enabled
      const snap = (v) => snapSize > 0 ? Math.round(v / snapSize) * snapSize : v;
      const newX = snap(p.x);
      const newY = snap(p.z);
      const newZ = Math.max(0, snap(p.y - comp.height / 2));
      // Sync mesh to snapped position
      if (snapSize > 0) {
        groupRef.current.position.set(newX, newZ + comp.height / 2, newY);
      }
      onMove(comp.id, {
        x: newX,
        y: newY,
        ground_z: newZ,
        rotY: r.y,
      });
    }
  }, [comp.id, comp.height, onMove, setOrbitEnabled, snapSize]);

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

// ── Build footprint points for non-rectangular shapes ─────────────────────────

function buildFootprintPoints(w, d, fp) {
  if (!fp || fp.shape === "rectangle") return null;
  const shape = fp.shape;
  const hw = w / 2, hd = d / 2;

  if (shape === "l_shape") {
    const nw = fp.notch_w || w * 0.4;
    const nd = fp.notch_d || d * 0.4;
    const corner = fp.notch_corner || "top_right";
    if (corner === "top_right")
      return [[-hw,-hd],[hw,-hd],[hw,hd-nd],[hw-nw,hd-nd],[hw-nw,hd],[-hw,hd]];
    if (corner === "top_left")
      return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw+nw,hd],[-hw+nw,hd-nd],[-hw,hd-nd]];
    if (corner === "bottom_right")
      return [[-hw,-hd],[hw-nw,-hd],[hw-nw,-hd+nd],[hw,-hd+nd],[hw,hd],[-hw,hd]];
    return [[-hw+nw,-hd],[-hw+nw,-hd+nd],[-hw,-hd+nd],[-hw,hd],[hw,hd],[hw,-hd]];
  }
  if (shape === "t_shape") {
    const tw = fp.tab_w || w * 0.4;
    const td = fp.tab_d || d * 0.3;
    const side = fp.tab_side || "top";
    if (side === "top")
      return [[-hw,-hd],[hw,-hd],[hw,hd-td],[tw/2,hd-td],[tw/2,hd],[-tw/2,hd],[-tw/2,hd-td],[-hw,hd-td]];
    if (side === "bottom")
      return [[-tw/2,-hd],[tw/2,-hd],[tw/2,-hd+td],[hw,-hd+td],[hw,hd],[-hw,hd],[-hw,-hd+td],[-tw/2,-hd+td]];
    if (side === "right")
      return [[-hw,-hd],[hw-td,-hd],[hw-td,-tw/2],[hw,-tw/2],[hw,tw/2],[hw-td,tw/2],[hw-td,hd],[-hw,hd]];
    return [[-hw+td,-hd],[hw,-hd],[hw,hd],[-hw+td,hd],[-hw+td,tw/2],[-hw,tw/2],[-hw,-tw/2],[-hw+td,-tw/2]];
  }
  if (shape === "u_shape") {
    const nw = fp.u_notch_w || w * 0.5;
    const nd = fp.u_notch_d || d * 0.5;
    const side = fp.u_open_side || "top";
    if (side === "top")
      return [[-hw,-hd],[hw,-hd],[hw,hd],[nw/2,hd],[nw/2,hd-nd],[-nw/2,hd-nd],[-nw/2,hd],[-hw,hd]];
    if (side === "bottom")
      return [[-hw,-hd],[-nw/2,-hd],[-nw/2,-hd+nd],[nw/2,-hd+nd],[nw/2,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
    if (side === "right")
      return [[-hw,-hd],[hw,-hd],[hw,-nw/2],[hw-nd,-nw/2],[hw-nd,nw/2],[hw,nw/2],[hw,hd],[-hw,hd]];
    return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd],[-hw,nw/2],[-hw+nd,nw/2],[-hw+nd,-nw/2],[-hw,-nw/2]];
  }
  if (shape === "plus") {
    const af = fp.arm_fraction || 0.4;
    const aw = w * af / 2;
    const ad = d * af / 2;
    return [[-aw,-hd],[aw,-hd],[aw,-ad],[hw,-ad],[hw,ad],[aw,ad],[aw,hd],[-aw,hd],[-aw,ad],[-hw,ad],[-hw,-ad],[-aw,-ad]];
  }
  if (shape === "hexagon" || shape === "octagon") {
    const sides = shape === "hexagon" ? 6 : 8;
    const r = Math.min(w, d) / 2;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
    return pts;
  }
  return null;
}

function FootprintShape3D({ w, d, h, fp, color, wireframe }) {
  const pts = buildFootprintPoints(w, d, fp);
  const geometry = useMemo(() => {
    if (!pts) return null;
    const shape = new THREE.Shape();
    // Note: in Three.js XZ plane, but we'll use XY then rotate
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    // Rotate so Z becomes Y (height axis)
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [pts, h]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, 0, 0]}>
      <meshBasicMaterial color={color} wireframe={wireframe} transparent opacity={wireframe ? 1 : 0.15} />
    </mesh>
  );
}

// ── Enclosure wireframe box with part highlighting ────────────────────────────

function EnclosureBox({ enclosure, selectedPart, parts, footprint }) {
  if (!enclosure) return null;

  const trayZ = parts && parts.tray && parts.tray.tray_z != null ? parts.tray.tray_z : 0;
  const trayEnabled = parts && parts.tray && parts.tray.enabled;
  const bracketEnabled = parts && parts.bracket && parts.bracket.enabled;

  const isNonRect = footprint && footprint.shape && footprint.shape !== "rectangle";

  return (
    <group>
      {/* Base half highlight */}
      {selectedPart === "base" && (
        <mesh position={[0, enclosure.h * 0.3, 0]}>
          <boxGeometry args={[enclosure.w + 0.5, enclosure.h * 0.6, enclosure.d + 0.5]} />
          <meshStandardMaterial color="#4ade80" transparent opacity={0.12} />
        </mesh>
      )}

      {/* Lid half highlight */}
      {selectedPart === "lid" && (
        <mesh position={[0, enclosure.h * 0.85, 0]}>
          <boxGeometry args={[enclosure.w + 0.5, enclosure.h * 0.3, enclosure.d + 0.5]} />
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.15} />
        </mesh>
      )}

      {/* Tray: thin horizontal plane at tray_z height */}
      {selectedPart === "tray" && trayEnabled && (
        <mesh position={[0, trayZ + 1, 0]}>
          <boxGeometry args={[enclosure.w * 0.9, 2, enclosure.d * 0.9]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.45} />
        </mesh>
      )}

      {/* Bracket: small shape on one side */}
      {selectedPart === "bracket" && bracketEnabled && (
        <mesh position={[enclosure.w / 2 + 2, enclosure.h * 0.3, 0]}>
          <boxGeometry args={[4, enclosure.h * 0.6, 30]} />
          <meshStandardMaterial color="#f59e0b" transparent opacity={0.5} />
        </mesh>
      )}

      {/* Main enclosure outline */}
      {isNonRect ? (
        <FootprintShape3D
          w={enclosure.w}
          d={enclosure.d}
          h={enclosure.h}
          fp={footprint}
          color="#4ade80"
          wireframe={true}
        />
      ) : (
        <mesh position={[0, enclosure.h / 2, 0]}>
          <boxGeometry args={[enclosure.w, enclosure.h, enclosure.d]} />
          <meshBasicMaterial color="#4ade80" wireframe />
        </mesh>
      )}
    </group>
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
  components, cutouts, customCutouts, config, parts,
  selectedId, selectedType, selectedPart,
  onSelectComponent, onSelectCutout, onSelectCustomCutout,
  onComponentMove, viewMode, transformMode,
  triggerFrame, snapSize, footprint,
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
          snapSize={snapSize || 0}
        />
      ))}

      {/* Enclosure outline */}
      {enclosure && <EnclosureBox enclosure={enclosure} selectedPart={selectedPart} parts={parts} footprint={footprint} />}

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

const SNAP_CYCLE = [0, 1, 2, 5]; // 0 = off
function snapLabel(s) {
  if (s === 0) return "Snap: OFF";
  return `Snap: ${s}mm`;
}

function ViewToolbar({ viewMode, setViewMode, transformMode, setTransformMode, onFrameAll, snapSize, onSnapCycle }) {
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
      <button
        className={`toolbar-btn${snapSize > 0 ? " active" : ""}`}
        onClick={onSnapCycle}
        title="Cycle grid snap: OFF → 1mm → 2mm → 5mm"
        style={{ minWidth: 80 }}
      >
        {snapLabel(snapSize)}
      </button>
      <button className="toolbar-btn frame-btn" onClick={onFrameAll} title="Reset camera to fit all">
        Frame
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Viewport3D({
  components, cutouts, customCutouts, config, parts,
  selectedId, selectedType, selectedPart,
  onSelectComponent, onSelectCutout, onSelectCustomCutout, onComponentMove,
  viewMode, setViewMode,
  transformMode, setTransformMode,
  footprint,
}) {
  const [frameCounter, setFrameCounter] = useState(0);
  const [snapSize, setSnapSize] = useState(0);

  function handleSnapCycle() {
    setSnapSize((s) => {
      const idx = SNAP_CYCLE.indexOf(s);
      return SNAP_CYCLE[(idx + 1) % SNAP_CYCLE.length];
    });
  }

  return (
    <div className="viewport-wrapper">
      <ViewToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        onFrameAll={() => setFrameCounter((c) => c + 1)}
        snapSize={snapSize}
        onSnapCycle={handleSnapCycle}
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
            parts={parts}
            selectedId={selectedId}
            selectedType={selectedType}
            selectedPart={selectedPart}
            onSelectComponent={onSelectComponent}
            onSelectCutout={onSelectCutout}
            onSelectCustomCutout={onSelectCustomCutout}
            onComponentMove={onComponentMove}
            viewMode={viewMode}
            transformMode={transformMode}
            triggerFrame={frameCounter}
            snapSize={snapSize}
            footprint={footprint}
          />
        </Canvas>
        {components.length === 0 && (
          <div className="viewer-empty">Add components to see the preview</div>
        )}
      </div>
    </div>
  );
}
