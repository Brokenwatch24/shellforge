"""
ShellForge - Generate enclosure from manual bounding box (no model file needed).
Useful for quick testing and for users who just know their component sizes.
"""
import cadquery as cq
from pathlib import Path

from .models import EnclosureConfig, Component, Vector3, LidStyle
from .generator import (
    compute_combined_bbox,
    _apply_connector_cutout,
    _apply_custom_cutout,
    _apply_enclosure_style,
    _add_pcb_standoffs,
    _build_lid_screws,
)


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
        w = spec["width"] / 2
        d = spec["depth"] / 2
        comp.bbox_min = Vector3(
            comp.position.x - w,
            comp.position.y - d,
            gz,
        )
        comp.bbox_max = Vector3(
            comp.position.x + w,
            comp.position.y + d,
            gz + spec["height"],
        )
        components.append(comp)

    config.components = components

    # --- 0. Apply enclosure style overrides ---
    style = config.enclosure_style
    if style == "minimal":
        wall = 1.8
        eff_fillet = 0.0
    else:
        wall = config.wall_thickness
        eff_fillet = config.fillet_radius
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

    # --- Build base shell ---
    base = (
        cq.Workplane("XY")
        .box(outer_w, outer_d, outer_h)
        .translate((0, 0, outer_h / 2))
    )
    cavity = (
        cq.Workplane("XY")
        .box(inner_w, inner_d, inner_h)
        .translate((0, 0, floor + inner_h / 2))
    )
    base = base.cut(cavity)

    if eff_fillet > 0:
        try:
            base = base.edges("|Z").fillet(eff_fillet)
        except Exception:
            pass

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
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center)
        except Exception as e:
            print(f"Warning: cutout skipped: {e}")

    # --- Custom cutouts ---
    for cutout in config.custom_cutouts:
        base = _apply_custom_cutout(base, cutout, inner_size, wall, inner_center)

    # --- Enclosure style (vented/ribbed) ---
    base = _apply_enclosure_style(base, style, outer_w, outer_d, outer_h, wall, floor)

    # --- Export base ---
    base_path = output_path / "enclosure_base.stl"
    cq.exporters.export(base, str(base_path))
    result = {"base": str(base_path)}

    # --- Generate lid ---
    if config.lid_style != LidStyle.NONE:
        lid = (
            cq.Workplane("XY")
            .box(outer_w, outer_d, lid_t)
            .translate((0, 0, lid_t / 2))
        )
        if eff_fillet > 0:
            try:
                lid = lid.edges("|Z").fillet(eff_fillet)
            except Exception:
                pass

        if config.lid_style == LidStyle.SCREWS:
            lid = _build_lid_screws(
                lid,
                lid_style="screws",
                lid_hole_style=config.lid_hole_style,
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
        cq.exporters.export(lid, str(lid_path))
        result["lid"] = str(lid_path)

    print(f"[OK] Enclosure generated from manual bbox: {result}")
    print(f"   Inner: {inner_w:.1f} x {inner_d:.1f} x {inner_h:.1f} mm")
    print(f"   Outer: {outer_w:.1f} x {outer_d:.1f} x {outer_h:.1f} mm")
    return result
