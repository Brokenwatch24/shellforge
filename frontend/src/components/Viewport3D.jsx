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

// ── Helper: rotated AABB in engineering coordinates ───────────────────────────
// comp.rotX/Y/Z are Three.js Euler angles.
// Three.js: X=eng.X, Y=eng.Z(up), Z=eng.Y(depth)
// Returns AABB relative to component center, in engineering coords.

function getRotatedAABB(comp) {
  const hw = (comp.width  || 0) / 2;
  const hh = (comp.height || 0) / 2;
  const hd = (comp.depth  || 0) / 2;
  const rotX = comp.rotX ?? 0;
  const rotY = comp.rotY ?? 0;
  const rotZ = comp.rotZ ?? 0;

  if (rotX === 0 && rotY === 0 && rotZ === 0) {
    // No rotation — trivial AABB in engineering coords
    // eng X=±hw, eng Y(depth)=±hd, eng Z(up)=±hh
    return { minX: -hw, maxX: hw, minY: -hd, maxY: hd, minZ: -hh, maxZ: hh };
  }

  // Build 8 corners in Three.js local space: ±hw in Three.js X, ±hh in Three.js Y, ±hd in Three.js Z
  const euler = new THREE.Euler(rotX, rotY, rotZ, "XYZ");
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(sx * hw, sy * hh, sz * hd));
      }
    }
  }

  let tminX = Infinity, tmaxX = -Infinity;
  let tminY = Infinity, tmaxY = -Infinity;
  let tminZ = Infinity, tmaxZ = -Infinity;

  for (const c of corners) {
    c.applyEuler(euler);
    tminX = Math.min(tminX, c.x); tmaxX = Math.max(tmaxX, c.x);
    tminY = Math.min(tminY, c.y); tmaxY = Math.max(tmaxY, c.y);
    tminZ = Math.min(tminZ, c.z); tmaxZ = Math.max(tmaxZ, c.z);
  }

  // Map Three.js → engineering: X→X, Y→engZ(up), Z→engY(depth)
  return {
    minX: tminX, maxX: tmaxX,   // eng X
    minY: tminZ, maxY: tmaxZ,   // eng Y (depth) from Three.js Z
    minZ: tminY, maxZ: tmaxY,   // eng Z (up) from Three.js Y
  };
}

// ── Helper: compute enclosure bbox from components + config ───────────────────
// Returns world-space dimensions AND center position for Three.js rendering.

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
    const aabb = getRotatedAABB(c);
    const cx = c.x ?? 0;
    const cy = c.y ?? 0;
    // Component center in eng Z (up): ground_z + height/2
    const cz = (c.ground_z ?? c.z ?? 0) + (c.height ?? 0) / 2;

    minX = Math.min(minX, cx + aabb.minX);
    maxX = Math.max(maxX, cx + aabb.maxX);
    minY = Math.min(minY, cy + aabb.minY);
    maxY = Math.max(maxY, cy + aabb.maxY);
    minZ = Math.min(minZ, cz + aabb.minZ);
    maxZ = Math.max(maxZ, cz + aabb.maxZ);
  }

  const innerW = (maxX - minX) + pad_x * 2;
  const innerD = (maxY - minY) + pad_y * 2;
  const innerH = (maxZ - minZ) + pad_z * 2;

  const outerW = innerW + wall * 2;
  const outerD = innerD + wall * 2;
  const outerH = innerH + floor;

  // World center of enclosure in Three.js coordinates
  // Three.js: X = eng X, Y = eng Z (up), Z = eng Y (depth)
  const worldX = (minX + maxX) / 2;
  const worldZ = (minY + maxY) / 2;
  // Outer box bottom in eng Z: minZ - pad_z - floor
  // Outer box top: maxZ + pad_z
  // World Y center = bottom + outerH/2
  const encBottomY = minZ - pad_z - floor;
  const worldY = encBottomY + outerH / 2;

  return {
    w: outerW,
    d: outerD,
    h: outerH,
    innerW, innerD, innerH,
    worldX, worldY, worldZ,
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

  const points = useMemo(() => [
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x, groundZ, z),
  ], [x, z, groundZ]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  useEffect(() => () => geometry.dispose(), [geometry]);

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
  const rotX   = comp.rotX ?? 0;
  const rotY   = comp.rotY ?? 0;
  const rotZ   = comp.rotZ ?? 0;

  // Sync position+rotation from state (only when not dragging)
  useEffect(() => {
    if (!isDragging && groupRef.current) {
      groupRef.current.position.set(threeX, threeY, threeZ);
      groupRef.current.rotation.set(rotX, rotY, rotZ);
    }
  }, [threeX, threeY, threeZ, rotX, rotY, rotZ, isDragging]);

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
      const snap = (v) => snapSize > 0 ? Math.round(v / snapSize) * snapSize : v;
      const newX = snap(p.x);
      const newY = snap(p.z);
      const newZ = Math.max(0, snap(p.y - comp.height / 2));
      if (snapSize > 0) {
        groupRef.current.position.set(newX, newZ + comp.height / 2, newY);
      }
      onMove(comp.id, {
        x: newX,
        y: newY,
        ground_z: newZ,
        rotX: r.x,
        rotY: r.y,
        rotZ: r.z,
      });
    }
  }, [comp.id, comp.height, onMove, setOrbitEnabled, snapSize]);

  // Real-time sync during drag — reads position+rotation and pushes to state
  const handleChange = useCallback(() => {
    if (!groupRef.current || !isDragging) return;
    const p = groupRef.current.position;
    const r = groupRef.current.rotation;
    const newZ = Math.max(0, p.y - comp.height / 2);
    onMove(comp.id, {
      x: p.x,
      y: p.z,
      ground_z: newZ,
      rotX: r.x,
      rotY: r.y,
      rotZ: r.z,
    });
  }, [comp.id, comp.height, isDragging, onMove]);

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

      {/* The actual mesh group — rotation applied via useEffect */}
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
          onChange={handleChange}
        />
      )}
    </>
  );
}

// ── Cutout visualization on enclosure walls ───────────────────────────────────
// Positions are LOCAL to the enclosure group (centered at enclosure center).

function CutoutBox({ cutout, enclosure, isSelected, onSelect, onMove, setOrbitEnabled }) {
  const meshRef = useRef();

  if (!enclosure) return null;

  const profile = CONNECTOR_PROFILES[cutout.connector_type] || { w: 10, h: 5 };
  const cw = profile.w;
  const ch = profile.h;
  const thickness = 2;
  const halfW = enclosure.w / 2;
  const halfD = enclosure.d / 2;

  const ox = cutout.offset_x ?? 0;
  const oy = cutout.offset_y ?? 0;

  // Positions are relative to enclosure center (group handles world offset)
  // Vertical: oy is offset from face vertical center (y=0 in local space)
  let position, rotation, dims;
  let showX = true, showY = true, showZ = false;
  let fixedAxis = "z", fixedValue = halfD;

  switch (cutout.face) {
    case "front":
      position = [ox, oy, halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
      showX = true; showY = true; showZ = false;
      fixedAxis = "z"; fixedValue = halfD;
      break;
    case "back":
      position = [ox, oy, -halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
      showX = true; showY = true; showZ = false;
      fixedAxis = "z"; fixedValue = -halfD;
      break;
    case "left":
      position = [-halfW, oy, ox];
      rotation = [0, Math.PI / 2, 0];
      dims = [cw, ch, thickness];
      showX = false; showY = true; showZ = true;
      fixedAxis = "x"; fixedValue = -halfW;
      break;
    case "right":
      position = [halfW, oy, ox];
      rotation = [0, Math.PI / 2, 0];
      dims = [cw, ch, thickness];
      showX = false; showY = true; showZ = true;
      fixedAxis = "x"; fixedValue = halfW;
      break;
    default:
      position = [ox, oy, halfD];
      rotation = [0, 0, 0];
      dims = [cw, ch, thickness];
  }

  const handleMouseDown = useCallback(() => {
    if (setOrbitEnabled) setOrbitEnabled(false);
  }, [setOrbitEnabled]);

  const handleMouseUp = useCallback(() => {
    if (setOrbitEnabled) setOrbitEnabled(true);
    if (!meshRef.current || !onMove) return;
    const pos = meshRef.current.position;
    let newOx, newOy;
    if (cutout.face === "left" || cutout.face === "right") {
      newOx = pos.z;
      newOy = pos.y;
      meshRef.current.position.x = fixedValue;
    } else {
      newOx = pos.x;
      newOy = pos.y;
      meshRef.current.position.z = fixedValue;
    }
    onMove(cutout.id, { offset_x: newOx, offset_y: newOy });
  }, [cutout.id, cutout.face, fixedValue, onMove, setOrbitEnabled]);

  const color = isSelected ? "#facc15" : "#94a3b8";

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        onClick={(e) => { e.stopPropagation(); onSelect(cutout.id); }}
      >
        <boxGeometry args={dims} />
        <meshStandardMaterial color={color} transparent opacity={0.85} />
      </mesh>

      {isSelected && meshRef.current && onMove && (
        <TransformControls
          object={meshRef.current}
          mode="translate"
          showX={showX}
          showY={showY}
          showZ={showZ}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}
    </>
  );
}

// ── Custom cutout visualization ───────────────────────────────────────────────
// Positions are LOCAL to the enclosure group.

function CustomCutoutMesh({ cutout, enclosure, isSelected, onSelect, onMove, setOrbitEnabled }) {
  const meshRef = useRef();

  if (!enclosure) return null;

  const w = cutout.width ?? 10;
  const h = cutout.height ?? 10;
  const thickness = 2;
  const halfW = enclosure.w / 2;
  const halfD = enclosure.d / 2;
  const ox = cutout.offset_x ?? 0;
  const oy = cutout.offset_y ?? 0;

  let position, rotation;
  let showX = true, showY = true, showZ = false;
  let fixedAxis = "z", fixedValue = halfD;

  switch (cutout.face) {
    case "front":
      position = [ox, oy, halfD + 0.5];
      rotation = [0, 0, 0];
      showX = true; showY = true; showZ = false;
      fixedAxis = "z"; fixedValue = halfD + 0.5;
      break;
    case "back":
      position = [ox, oy, -halfD - 0.5];
      rotation = [0, 0, 0];
      showX = true; showY = true; showZ = false;
      fixedAxis = "z"; fixedValue = -halfD - 0.5;
      break;
    case "left":
      position = [-halfW - 0.5, oy, ox];
      rotation = [0, Math.PI / 2, 0];
      showX = false; showY = true; showZ = true;
      fixedAxis = "x"; fixedValue = -halfW - 0.5;
      break;
    case "right":
      position = [halfW + 0.5, oy, ox];
      rotation = [0, Math.PI / 2, 0];
      showX = false; showY = true; showZ = true;
      fixedAxis = "x"; fixedValue = halfW + 0.5;
      break;
    default:
      position = [ox, oy, halfD + 0.5];
      rotation = [0, 0, 0];
  }

  const handleMouseDown = useCallback(() => {
    if (setOrbitEnabled) setOrbitEnabled(false);
  }, [setOrbitEnabled]);

  const handleMouseUp = useCallback(() => {
    if (setOrbitEnabled) setOrbitEnabled(true);
    if (!meshRef.current || !onMove) return;
    const pos = meshRef.current.position;
    let newOx, newOy;
    if (cutout.face === "left" || cutout.face === "right") {
      newOx = pos.z;
      newOy = pos.y;
      meshRef.current.position.x = fixedValue;
    } else {
      newOx = pos.x;
      newOy = pos.y;
      meshRef.current.position.z = fixedValue;
    }
    onMove(cutout.id, { offset_x: newOx, offset_y: newOy });
  }, [cutout.id, cutout.face, fixedValue, onMove, setOrbitEnabled]);

  const color = isSelected ? "#fbbf24" : "#f59e0b";
  const shape = cutout.shape;

  // Circle shape — use ring geometry
  if (shape === "circle") {
    const ringGeo = useMemo(() => new THREE.RingGeometry(w / 2 - 0.5, w / 2, 32), [w]);
    useEffect(() => () => ringGeo.dispose(), [ringGeo]);
    return (
      <>
        <mesh
          ref={meshRef}
          position={position}
          rotation={rotation}
          onClick={(e) => { e.stopPropagation(); onSelect && onSelect(cutout.id); }}
        >
          <primitive object={ringGeo} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        {isSelected && meshRef.current && onMove && (
          <TransformControls
            object={meshRef.current}
            mode="translate"
            showX={showX}
            showY={showY}
            showZ={showZ}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          />
        )}
      </>
    );
  }

  // Rectangle / hexagon / triangle — box geometry
  return (
    <>
      <mesh
        ref={meshRef}
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
      {isSelected && meshRef.current && onMove && (
        <TransformControls
          object={meshRef.current}
          mode="translate"
          showX={showX}
          showY={showY}
          showZ={showZ}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}
    </>
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

function FootprintShape3D({ w, d, h, fp, color, wireframe, yOffset = 0 }) {
  const geometry = useMemo(() => {
    const pts = buildFootprintPoints(w, d, fp);
    if (!pts) return null;
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    // Rotate so Z becomes Y (height axis), bottom at y=0
    geo.rotateX(-Math.PI / 2);
    return geo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, d, h, fp]);

  useEffect(() => () => { if (geometry) geometry.dispose(); }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, yOffset, 0]}>
      <meshBasicMaterial color={color} wireframe={wireframe} transparent opacity={wireframe ? 1 : 0.15} />
    </mesh>
  );
}

// ── Enclosure wireframe box with part highlighting ────────────────────────────
// Rendered inside a group at the enclosure's world center.
// All positions here are LOCAL (relative to group center).

function EnclosureBox({ enclosure, selectedPart, parts, footprint }) {
  if (!enclosure) return null;

  const trayZ = parts && parts.tray && parts.tray.tray_z != null ? parts.tray.tray_z : 0;
  const trayEnabled = parts && parts.tray && parts.tray.enabled;
  const bracketEnabled = parts && parts.bracket && parts.bracket.enabled;

  const isNonRect = footprint && footprint.shape && footprint.shape !== "rectangle";
  const hh = enclosure.h / 2;  // half-height for local coords

  return (
    <group>
      {/* Base half highlight — bottom ~60% of enclosure */}
      {selectedPart === "base" && (
        <mesh position={[0, -hh * 0.4, 0]}>
          <boxGeometry args={[enclosure.w + 0.5, enclosure.h * 0.6, enclosure.d + 0.5]} />
          <meshStandardMaterial color="#4ade80" transparent opacity={0.12} />
        </mesh>
      )}

      {/* Lid half highlight — top ~30% of enclosure */}
      {selectedPart === "lid" && (
        <mesh position={[0, hh * 0.7, 0]}>
          <boxGeometry args={[enclosure.w + 0.5, enclosure.h * 0.3, enclosure.d + 0.5]} />
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.15} />
        </mesh>
      )}

      {/* Tray: thin horizontal plane at tray_z height */}
      {selectedPart === "tray" && trayEnabled && (
        <mesh position={[0, -hh + trayZ + 1, 0]}>
          <boxGeometry args={[enclosure.w * 0.9, 2, enclosure.d * 0.9]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.45} />
        </mesh>
      )}

      {/* Bracket: small shape on one side */}
      {selectedPart === "bracket" && bracketEnabled && (
        <mesh position={[enclosure.w / 2 + 2, -hh * 0.4, 0]}>
          <boxGeometry args={[4, enclosure.h * 0.6, 30]} />
          <meshStandardMaterial color="#f59e0b" transparent opacity={0.5} />
        </mesh>
      )}

      {/* Main enclosure outline — non-rect footprint or plain box */}
      {isNonRect ? (
        <FootprintShape3D
          w={enclosure.w}
          d={enclosure.d}
          h={enclosure.h}
          fp={footprint}
          color="#4ade80"
          wireframe={true}
          yOffset={-hh}
        />
      ) : (
        <mesh position={[0, 0, 0]}>
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
      target.set(enclosure.worldX, enclosure.worldY, enclosure.worldZ);
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
  onComponentMove, onCutoutMove, onCustomCutoutMove,
  viewMode, transformMode,
  triggerFrame, snapSize, footprint,
}) {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const enclosure = useMemo(
    () => computeEnclosureBbox(components, config),
    [components, config]
  );

  // Enclosure group world position
  const encPos = enclosure
    ? [enclosure.worldX, enclosure.worldY, enclosure.worldZ]
    : [0, 0, 0];

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

      {/* Enclosure group — centered at computed world position */}
      {enclosure && (
        <group position={encPos}>
          {/* Enclosure outline + part highlights */}
          <EnclosureBox
            enclosure={enclosure}
            selectedPart={selectedPart}
            parts={parts}
            footprint={footprint}
          />

          {/* Connector cutout boxes on walls */}
          {cutouts.map((co) => (
            <CutoutBox
              key={co.id}
              cutout={co}
              enclosure={enclosure}
              isSelected={selectedId === co.id && selectedType === "cutout"}
              onSelect={onSelectCutout}
              onMove={onCutoutMove}
              setOrbitEnabled={setOrbitEnabled}
            />
          ))}

          {/* Custom cutouts on walls */}
          {customCutouts && customCutouts.map((cc) => (
            <CustomCutoutMesh
              key={cc.id}
              cutout={cc}
              enclosure={enclosure}
              isSelected={selectedId === cc.id && selectedType === "customCutout"}
              onSelect={onSelectCustomCutout}
              onMove={onCustomCutoutMove}
              setOrbitEnabled={setOrbitEnabled}
            />
          ))}
        </group>
      )}

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

const SNAP_CYCLE = [0, 1, 2, 5];
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
          title="Rotate selected component (X/Y/Z)"
        >
          Rotate
        </button>
      </div>
      <button
        className={`toolbar-btn${snapSize > 0 ? " active" : ""}`}
        onClick={onSnapCycle}
        title="Cycle grid snap: OFF -> 1mm -> 2mm -> 5mm"
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
  onSelectComponent, onSelectCutout, onSelectCustomCutout,
  onComponentMove, onCutoutMove, onCustomCutoutMove,
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

  const isCustomShape = footprint && footprint.shape && footprint.shape !== "rectangle";
  const shapeLabel = isCustomShape
    ? footprint.shape.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

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
      <div className="viewer-wrapper" style={{ position: "relative" }}>
        <div className="viewer-label">3D Preview</div>

        {/* Wrapper mode indicator overlay */}
        <div style={{
          position: "absolute",
          top: 40,
          right: 10,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(0,0,0,0.72)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          pointerEvents: "none",
          userSelect: "none",
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isCustomShape ? "#f97316" : "#22c55e",
            flexShrink: 0,
          }} />
          <span style={{ color: isCustomShape ? "#f97316" : "#22c55e", whiteSpace: "nowrap" }}>
            {isCustomShape ? `Custom Shape: ${shapeLabel}` : "Auto Wrap"}
          </span>
        </div>

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
            onCutoutMove={onCutoutMove}
            onCustomCutoutMove={onCustomCutoutMove}
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
