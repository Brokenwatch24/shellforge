"""
ShellForge - Generate enclosure from manual bounding box (no model file needed).
Useful for quick testing and for users who just know their component sizes.
"""
import cadquery as cq
import math
from pathlib import Path

from .models import EnclosureConfig, Component, Vector3, LidStyle, PartConfig


def _rotated_bbox(width, depth, height, rot_x=0, rot_y=0, rot_z=0):
    """
    Compute the AABB of a box after rotation.
    rot_x/y/z are Three.js Euler angles in radians (XYZ order).
    Three.js coords: X=engX, Y=engZ(up), Z=engY(depth)
    Returns (eff_width, eff_depth, eff_height) in engineering space.
    """
    if rot_x == 0 and rot_y == 0 and rot_z == 0:
        return width, depth, height

    hw, hh, hd = width / 2, height / 2, depth / 2

    # Build rotation matrices for XYZ Euler (Three.js convention)
    cx, sx = math.cos(rot_x), math.sin(rot_x)
    cy, sy = math.cos(rot_y), math.sin(rot_y)
    cz, sz = math.cos(rot_z), math.sin(rot_z)

    # Rotate 8 corners in Three.js local space: (±hw, ±hh, ±hd)
    # Apply R = Rz * Ry * Rx (intrinsic XYZ = extrinsic ZYX)
    corners = []
    for sx_ in [-1, 1]:
        for sy_ in [-1, 1]:
            for sz_ in [-1, 1]:
                x, y, z = sx_ * hw, sy_ * hh, sz_ * hd
                # Apply rotX
                x1 = x
                y1 = y * cx - z * sx
                z1 = y * sx + z * cx
                # Apply rotY
                x2 = x1 * cy + z1 * sy
                y2 = y1
                z2 = -x1 * sy + z1 * cy
                # Apply rotZ
                x3 = x2 * cz - y2 * sz
                y3 = x2 * sz + y2 * cz
                z3 = z2
                corners.append((x3, y3, z3))

    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    zs = [c[2] for c in corners]

    # Three.js: X=engX, Y=engZ(up), Z=engY(depth)
    eff_width  = max(xs) - min(xs)   # engineering width (X)
    eff_height = max(ys) - min(ys)   # engineering height (Z/up) from Three.js Y
    eff_depth  = max(zs) - min(zs)   # engineering depth (Y) from Three.js Z
    return eff_width, eff_depth, eff_height
from .generator import (
    compute_combined_bbox,
    _apply_connector_cutout,
    _apply_custom_cutout,
    _apply_enclosure_style,
    _add_pcb_standoffs,
    _build_lid_screws,
    _build_footprint,
    _export_shape,
    _apply_edges,
)


def _get_part(config: EnclosureConfig, part_name: str) -> PartConfig:
    """Get part config, falling back to defaults if not present."""
    parts = config.parts
    if isinstance(parts, dict):
        return parts.get(part_name, PartConfig())
    return PartConfig()


def generate_from_manual_bbox(
    components_bbox: list,
    config: EnclosureConfig,
    output_dir: str = "./output"
) -> dict:
    """
    Generate enclosure from manually specified bounding boxes.

    components_bbox format:
    [
        {
            "name": "Arduino Nano",
            "width": 18.0,   # mm
            "depth": 45.0,   # mm
            "height": 15.0,  # mm
            "x": 0.0,        # position offset
            "y": 0.0,
            "z": 0.0,
            # optional PCB fields:
            "is_pcb": False,
            "pcb_screw_diameter": 3.0,
            "ground_z": 0.0,
            "standoff_positions": [],
        },
        ...
    ]
    """
    # Convert dict specs to Component objects with pre-computed bboxes
    components = []
    for spec in components_bbox:
        gz = spec.get("ground_z", spec.get("z", 0))
        rx = spec.get("rot_x", 0)
        ry = spec.get("rot_y", 0)
        rz = spec.get("rot_z", 0)

        # Compute effective (rotated) dimensions for AABB
        eff_w, eff_d, eff_h = _rotated_bbox(
            spec["width"], spec["depth"], spec["height"],
            rot_x=rx, rot_y=ry, rot_z=rz,
        )

        comp = Component(
            name=spec["name"],
            file_path="",  # no file for manual bbox
            position=Vector3(
                spec.get("x", 0),
                spec.get("y", 0),
                gz,
            ),
            is_pcb=spec.get("is_pcb", False),
            pcb_screw_diameter=spec.get("pcb_screw_diameter", 3.0),
            ground_z=gz,
            standoff_positions=spec.get("standoff_positions", []),
        )
        hw = eff_w / 2
        hd = eff_d / 2
        comp.bbox_min = Vector3(
            comp.position.x - hw,
            comp.position.y - hd,
            gz,
        )
        comp.bbox_max = Vector3(
            comp.position.x + hw,
            comp.position.y + hd,
            gz + eff_h,
        )
        components.append(comp)

    config.components = components

    # --- Per-part config ---
    base_part = _get_part(config, "base")
    lid_part = _get_part(config, "lid")
    tray_part = _get_part(config, "tray")
    bracket_part = _get_part(config, "bracket")

    # --- 0. Apply enclosure style overrides (base part drives global style) ---
    style = base_part.style if base_part.style else config.enclosure_style
    if style == "minimal":
        wall = 1.8
        eff_fillet = 0.0
    else:
        wall = base_part.wall_thickness if base_part.wall_thickness else config.wall_thickness
        eff_fillet = base_part.fillet_radius
        if style == "rounded":
            eff_fillet = 3.0

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    bbox_min, bbox_max = compute_combined_bbox(components)

    cavity_center_x = (bbox_min.x + bbox_max.x) / 2
    cavity_center_y = (bbox_min.y + bbox_max.y) / 2

    inner_w = (bbox_max.x - bbox_min.x) + config.padding_x * 2
    inner_d = (bbox_max.y - bbox_min.y) + config.padding_y * 2
    inner_h = (bbox_max.z - bbox_min.z) + config.padding_z * 2

    inner_size = Vector3(inner_w, inner_d, inner_h)

    floor = config.floor_thickness
    lid_t = config.lid_thickness

    outer_w = inner_w + wall * 2
    outer_d = inner_d + wall * 2
    outer_h = inner_h + floor

    inner_center = Vector3(0, 0, floor + inner_h / 2)

    # Boss height from screw_length
    boss_h = max(config.screw_length - lid_t, 3.0)

    # --- Build base shell using footprint ---
    footprint = _build_footprint(outer_w, outer_d, config.footprint)
    base = footprint.extrude(outer_h)

    cavity_fp = _build_footprint(inner_w, inner_d, config.footprint)
    cavity = cavity_fp.extrude(inner_h).translate((0, 0, floor))
    base = base.cut(cavity)

    base = _apply_edges(base, base_part, eff_fillet)

    # --- Screw bosses ---
    if config.lid_style == LidStyle.SCREWS and style != "minimal":
        boss_r = config.boss_diameter / 2
        screw_r = config.screw_diameter / 2
        inset = boss_r + wall
        for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            bx = sx * (inner_w / 2 - inset)
            by = sy * (inner_d / 2 - inset)
            boss = cq.Workplane("XY").cylinder(boss_h, boss_r).translate((bx, by, floor + boss_h / 2))
            hole = cq.Workplane("XY").cylinder(boss_h + 1, screw_r).translate((bx, by, floor + boss_h / 2))
            base = base.union(boss).cut(hole)

    # --- PCB standoffs ---
    if config.pcb_standoffs_enabled:
        base = _add_pcb_standoffs(base, components, cavity_center_x, cavity_center_y, floor)

    # --- Connector cutouts ---
    for cutout in config.cutouts:
        try:
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center, outer_h)
        except Exception as e:
            print(f"Warning: cutout skipped: {e}")

    # --- Custom cutouts ---
    for cutout in config.custom_cutouts:
        base = _apply_custom_cutout(base, cutout, inner_size, wall, inner_center, outer_h)

    # --- Enclosure style (vented/ribbed) ---
    base = _apply_enclosure_style(base, style, outer_w, outer_d, outer_h, wall, floor)

    # --- Export base ---
    base_path = output_path / "enclosure_base.stl"
    _export_shape(base, base_path)
    result = {"base": str(base_path)}
    if (output_path / "enclosure_base.3mf").exists():
        result["base_3mf"] = str(output_path / "enclosure_base.3mf")

    # --- Generate lid ---
    if config.lid_style != LidStyle.NONE:
        lid_style_str = base_part.style if base_part.style else config.enclosure_style
        lid_fillet = lid_part.fillet_radius
        if lid_style_str == "rounded":
            lid_fillet = 3.0
        if lid_style_str == "minimal":
            lid_fillet = 0.0
        lid_hole_style = lid_part.lid_hole_style if lid_part.lid_hole_style else config.lid_hole_style

        lid_fp = _build_footprint(outer_w, outer_d, config.footprint)
        lid = lid_fp.extrude(lid_t)
        lid = _apply_edges(lid, lid_part, lid_fillet)

        if config.lid_style == LidStyle.SCREWS:
            lid = _build_lid_screws(
                lid,
                lid_style="screws",
                lid_hole_style=lid_hole_style,
                lid_t=lid_t,
                screw_r=config.screw_diameter / 2,
                inner_w=inner_w,
                inner_d=inner_d,
                boss_diameter=config.boss_diameter,
                wall=wall,
            )
        elif config.lid_style == LidStyle.SNAP:
            rim_h = config.snap_depth * 2
            rim = (
                cq.Workplane("XY")
                .box(inner_w, inner_d, rim_h)
                .translate((0, 0, lid_t + rim_h / 2))
            )
            rim_inner = (
                cq.Workplane("XY")
                .box(inner_w - wall * 2, inner_d - wall * 2, rim_h + 1)
                .translate((0, 0, lid_t + rim_h / 2))
            )
            lid = lid.union(rim).cut(rim_inner)

        lid_path = output_path / "enclosure_lid.stl"
        _export_shape(lid, lid_path)
        result["lid"] = str(lid_path)
        if (output_path / "enclosure_lid.3mf").exists():
            result["lid_3mf"] = str(output_path / "enclosure_lid.3mf")

    # --- Generate tray (optional) ---
    if tray_part.enabled:
        tray_z = tray_part.tray_z
        tray_thickness = tray_part.tray_thickness
        clearance = 2.0

        tray_w = inner_w - clearance * 2
        tray_d = inner_d - clearance * 2

        tray = (
            cq.Workplane("XY")
            .box(tray_w, tray_d, tray_thickness)
            .translate((0, 0, floor + tray_z + tray_thickness / 2))
        )

        tray_path = output_path / "enclosure_tray.stl"
        _export_shape(tray, tray_path)
        result["tray"] = str(tray_path)

    # --- Generate bracket (optional) ---
    if bracket_part.enabled:
        bracket_wall = bracket_part.wall_thickness if bracket_part.wall_thickness else wall
        hole_d = bracket_part.bracket_hole_diameter
        bracket_w = 30.0
        bracket_h = outer_h * 0.6  # covers 60% of enclosure height
        bracket_t = bracket_wall

        # Flat back plate
        back_plate = (
            cq.Workplane("XY")
            .box(bracket_w, bracket_t, bracket_h)
            .translate((0, 0, bracket_h / 2))
        )

        # L-flange (mounts to enclosure side)
        flange_d = 12.0
        flange = (
            cq.Workplane("XY")
            .box(bracket_w, flange_d, bracket_t)
            .translate((0, flange_d / 2, bracket_h))
        )
        bracket = back_plate.union(flange)

        # Drill 2 mounting holes in the back plate
        hole_r = hole_d / 2
        for hz in [bracket_h * 0.25, bracket_h * 0.75]:
            hole = (
                cq.Workplane("YZ")
                .cylinder(bracket_t + 2, hole_r)
                .translate((0, 0, hz))
            )
            try:
                bracket = bracket.cut(hole)
            except Exception:
                pass

        bracket_path = output_path / "enclosure_bracket.stl"
        _export_shape(bracket, bracket_path)
        result["bracket"] = str(bracket_path)

    print(f"[OK] Enclosure generated from manual bbox: {result}")
    print(f"   Inner: {inner_w:.1f} x {inner_d:.1f} x {inner_h:.1f} mm")
    print(f"   Outer: {outer_w:.1f} x {outer_d:.1f} x {outer_h:.1f} mm")
    return result
