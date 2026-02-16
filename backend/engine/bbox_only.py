"""
ShellForge - Generate enclosure from manual bounding box (no model file needed).
Useful for quick testing and for users who just know their component sizes.
"""
import cadquery as cq
from pathlib import Path

from .models import EnclosureConfig, Component, Vector3


def generate_from_manual_bbox(
    components_bbox: list[dict],
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
        },
        ...
    ]
    """
    # Convert dict specs to Component objects with pre-computed bboxes
    components = []
    for spec in components_bbox:
        comp = Component(
            name=spec["name"],
            file_path="",  # no file for manual bbox
            position=Vector3(
                spec.get("x", 0),
                spec.get("y", 0),
                spec.get("z", 0)
            ),
        )
        w = spec["width"] / 2
        d = spec["depth"] / 2
        h = spec["height"] / 2
        comp.bbox_min = Vector3(
            comp.position.x - w,
            comp.position.y - d,
            comp.position.z,
        )
        comp.bbox_max = Vector3(
            comp.position.x + w,
            comp.position.y + d,
            comp.position.z + spec["height"],
        )
        components.append(comp)

    config.components = components

    # Reuse the main generator but skip model loading
    from .generator import compute_combined_bbox, _apply_connector_cutout, LidStyle

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    bbox_min, bbox_max = compute_combined_bbox(components)

    inner_w = (bbox_max.x - bbox_min.x) + config.padding_x * 2
    inner_d = (bbox_max.y - bbox_min.y) + config.padding_y * 2
    inner_h = (bbox_max.z - bbox_min.z) + config.padding_z * 2

    inner_size = Vector3(inner_w, inner_d, inner_h)

    wall = config.wall_thickness
    floor = config.floor_thickness

    outer_w = inner_w + wall * 2
    outer_d = inner_d + wall * 2
    outer_h = inner_h + floor

    inner_center = Vector3(0, 0, floor + inner_h / 2)

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

    if config.fillet_radius > 0:
        try:
            base = base.edges("|Z").fillet(config.fillet_radius)
        except Exception:
            pass

    if config.lid_style == LidStyle.SCREWS:
        boss_r = config.boss_diameter / 2
        screw_r = config.screw_diameter / 2
        boss_h = config.boss_height
        inset = boss_r + wall
        for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            bx = sx * (inner_w / 2 - inset)
            by = sy * (inner_d / 2 - inset)
            boss = cq.Workplane("XY").cylinder(boss_h, boss_r).translate((bx, by, floor + boss_h / 2))
            hole = cq.Workplane("XY").cylinder(boss_h + 1, screw_r).translate((bx, by, floor + boss_h / 2))
            base = base.union(boss).cut(hole)

    for cutout in config.cutouts:
        try:
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center)
        except Exception as e:
            print(f"Warning: cutout skipped: {e}")

    base_path = output_path / "enclosure_base.stl"
    cq.exporters.export(base, str(base_path))
    result = {"base": str(base_path)}

    lid_t = config.lid_thickness
    if config.lid_style != LidStyle.NONE:
        lid = (
            cq.Workplane("XY")
            .box(outer_w, outer_d, lid_t)
            .translate((0, 0, lid_t / 2))
        )
        if config.fillet_radius > 0:
            try:
                lid = lid.edges("|Z").fillet(config.fillet_radius)
            except Exception:
                pass
        if config.lid_style == LidStyle.SCREWS:
            inset = config.boss_diameter / 2 + wall
            screw_r = config.screw_diameter / 2
            for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                bx = sx * (inner_w / 2 - inset)
                by = sy * (inner_d / 2 - inset)
                hole = cq.Workplane("XY").cylinder(lid_t + 1, screw_r).translate((bx, by, lid_t / 2))
                lid = lid.cut(hole)
        lid_path = output_path / "enclosure_lid.stl"
        cq.exporters.export(lid, str(lid_path))
        result["lid"] = str(lid_path)

    print(f"[OK] Enclosure generated from manual bbox: {result}")
    print(f"   Inner dimensions: {inner_w:.1f} x {inner_d:.1f} x {inner_h:.1f} mm")
    print(f"   Outer dimensions: {outer_w:.1f} x {outer_d:.1f} x {outer_h:.1f} mm")
    return result
