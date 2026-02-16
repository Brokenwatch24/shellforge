"""
ShellForge - Core enclosure generator engine.
Uses CadQuery to generate 3D printable enclosures from component bounding boxes.
"""
import cadquery as cq
from pathlib import Path
from typing import Optional
import math

from .models import (
    EnclosureConfig, Component, ConnectorCutout,
    LidStyle, WallFace, ConnectorType, Vector3
)
from ..connectors.profiles import get_profile


def load_component_bbox(component: Component) -> Component:
    """
    Load a 3D model (STEP or STL) and compute its bounding box.
    Returns the component with bbox_min and bbox_max filled in.
    """
    path = Path(component.file_path)
    if not path.exists():
        raise FileNotFoundError(f"Component file not found: {component.file_path}")

    ext = path.suffix.lower()

    if ext in (".step", ".stp"):
        shape = cq.importers.importStep(str(path))
    elif ext == ".stl":
        shape = cq.importers.importShape("STL", str(path))
    else:
        raise ValueError(f"Unsupported file format: {ext}. Use STEP (.step/.stp) or STL (.stl)")

    bb = shape.val().BoundingBox()

    # Apply component position offset
    component.bbox_min = Vector3(
        bb.xmin + component.position.x,
        bb.ymin + component.position.y,
        bb.zmin + component.position.z,
    )
    component.bbox_max = Vector3(
        bb.xmax + component.position.x,
        bb.ymax + component.position.y,
        bb.zmax + component.position.z,
    )

    return component


def compute_combined_bbox(components: list[Component]) -> tuple[Vector3, Vector3]:
    """
    Compute the combined bounding box of all components.
    Returns (bbox_min, bbox_max).
    """
    if not components:
        raise ValueError("No components provided")

    min_x = min(c.bbox_min.x for c in components)
    min_y = min(c.bbox_min.y for c in components)
    min_z = min(c.bbox_min.z for c in components)
    max_x = max(c.bbox_max.x for c in components)
    max_y = max(c.bbox_max.y for c in components)
    max_z = max(c.bbox_max.z for c in components)

    return Vector3(min_x, min_y, min_z), Vector3(max_x, max_y, max_z)


def _apply_connector_cutout(
    shell: cq.Workplane,
    cutout: ConnectorCutout,
    inner_size: Vector3,
    wall_thickness: float,
    inner_center: Vector3,
) -> cq.Workplane:
    """Apply a single connector cutout to the shell."""

    profile = get_profile(cutout.connector_type.value)
    is_round = profile.get("is_round", False)

    cut_w = profile.get("width", cutout.custom_width or 10)
    cut_h = profile.get("height", cutout.custom_height or 10)
    cut_d = wall_thickness + 2  # slightly deeper than wall to ensure clean cut

    face = cutout.face

    # Determine position and orientation based on face
    if face == WallFace.FRONT:
        # Front face (+Y)
        pos_x = inner_center.x + cutout.offset_x
        pos_y = inner_center.y + inner_size.y / 2 + wall_thickness / 2
        pos_z = inner_center.z + cutout.offset_y
        wp = (
            cq.Workplane("XZ")
            .transformed(offset=(pos_x, pos_z, pos_y))
        )
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.BACK:
        pos_x = inner_center.x + cutout.offset_x
        pos_y = inner_center.y - inner_size.y / 2 - wall_thickness / 2
        pos_z = inner_center.z + cutout.offset_y
        wp = (
            cq.Workplane("XZ")
            .transformed(offset=(pos_x, pos_z, pos_y))
        )
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.RIGHT:
        pos_x = inner_center.x + inner_size.x / 2 + wall_thickness / 2
        pos_y = inner_center.y + cutout.offset_x
        pos_z = inner_center.z + cutout.offset_y
        wp = (
            cq.Workplane("YZ")
            .transformed(offset=(pos_y, pos_z, pos_x))
        )
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.LEFT:
        pos_x = inner_center.x - inner_size.x / 2 - wall_thickness / 2
        pos_y = inner_center.y + cutout.offset_x
        pos_z = inner_center.z + cutout.offset_y
        wp = (
            cq.Workplane("YZ")
            .transformed(offset=(pos_y, pos_z, pos_x))
        )
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    else:
        # TOP or BOTTOM - skip for now
        return shell

    shell = shell.cut(cut)
    return shell


def generate_enclosure(config: EnclosureConfig, output_dir: str = "./output") -> dict:
    """
    Main function: generate enclosure from config.

    Returns paths to generated STL files:
    {
        "base": "path/to/enclosure_base.stl",
        "lid": "path/to/enclosure_lid.stl"   (if lid_style != NONE)
    }
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # --- 1. Load all components and compute bboxes ---
    loaded = []
    for comp in config.components:
        loaded.append(load_component_bbox(comp))

    # --- 2. Combined bounding box ---
    bbox_min, bbox_max = compute_combined_bbox(loaded)

    # Inner cavity dimensions (components + padding)
    inner_w = (bbox_max.x - bbox_min.x) + config.padding_x * 2
    inner_d = (bbox_max.y - bbox_min.y) + config.padding_y * 2
    inner_h = (bbox_max.z - bbox_min.z) + config.padding_z * 2

    inner_size = Vector3(inner_w, inner_d, inner_h)

    wall = config.wall_thickness
    floor = config.floor_thickness
    lid_t = config.lid_thickness

    # Outer dimensions
    outer_w = inner_w + wall * 2
    outer_d = inner_d + wall * 2
    outer_h = inner_h + floor  # floor at bottom, open top (lid closes it)

    # Center of inner cavity
    inner_center = Vector3(0, 0, floor + inner_h / 2)

    # --- 3. Build the base shell ---
    # Outer box
    base = (
        cq.Workplane("XY")
        .box(outer_w, outer_d, outer_h)
        .translate((0, 0, outer_h / 2))
    )

    # Subtract inner cavity (from top, leaving floor)
    cavity = (
        cq.Workplane("XY")
        .box(inner_w, inner_d, inner_h)
        .translate((0, 0, floor + inner_h / 2))
    )
    base = base.cut(cavity)

    # Fillet outer edges (if radius > 0)
    if config.fillet_radius > 0:
        try:
            base = base.edges("|Z").fillet(config.fillet_radius)
        except Exception:
            pass  # skip fillet if geometry doesn't support it

    # --- 4. Add screw bosses (for SCREWS lid style) ---
    if config.lid_style == LidStyle.SCREWS:
        boss_r = config.boss_diameter / 2
        screw_r = config.screw_diameter / 2
        boss_h = config.boss_height
        inset = boss_r + wall

        # Four corners inside the base
        for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            bx = sx * (inner_w / 2 - inset)
            by = sy * (inner_d / 2 - inset)
            boss = (
                cq.Workplane("XY")
                .cylinder(boss_h, boss_r)
                .translate((bx, by, floor + boss_h / 2))
            )
            screw_hole = (
                cq.Workplane("XY")
                .cylinder(boss_h + 1, screw_r)
                .translate((bx, by, floor + boss_h / 2))
            )
            base = base.union(boss).cut(screw_hole)

    # --- 5. Apply connector cutouts to base ---
    for cutout in config.cutouts:
        try:
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center)
        except Exception as e:
            print(f"Warning: Could not apply cutout {cutout.connector_type}: {e}")

    # --- 6. Export base ---
    base_path = output_path / "enclosure_base.stl"
    cq.exporters.export(base, str(base_path))
    result = {"base": str(base_path)}

    # --- 7. Generate lid ---
    if config.lid_style != LidStyle.NONE:
        if config.lid_style == LidStyle.SCREWS:
            # Flat lid with screw holes aligned to bosses
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

            inset = config.boss_diameter / 2 + wall
            screw_r = config.screw_diameter / 2

            for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                bx = sx * (inner_w / 2 - inset)
                by = sy * (inner_d / 2 - inset)
                hole = (
                    cq.Workplane("XY")
                    .cylinder(lid_t + 1, screw_r)
                    .translate((bx, by, lid_t / 2))
                )
                lid = lid.cut(hole)

        elif config.lid_style == LidStyle.SNAP:
            # Lid with snap tabs on the inside perimeter
            lid = (
                cq.Workplane("XY")
                .box(outer_w, outer_d, lid_t)
                .translate((0, 0, lid_t / 2))
            )
            # Add inner rim to snap into box opening
            rim_h = config.snap_depth * 2
            rim = (
                cq.Workplane("XY")
                .box(inner_w, inner_d, rim_h)
                .translate((0, 0, lid_t + rim_h / 2))
            )
            # Hollow the rim
            rim_inner = (
                cq.Workplane("XY")
                .box(inner_w - wall * 2, inner_d - wall * 2, rim_h + 1)
                .translate((0, 0, lid_t + rim_h / 2))
            )
            lid = lid.union(rim).cut(rim_inner)

        lid_path = output_path / "enclosure_lid.stl"
        cq.exporters.export(lid, str(lid_path))
        result["lid"] = str(lid_path)

    print(f"✅ Enclosure generated: {result}")
    return result
