"""
ShellForge - Core enclosure generator engine.
Uses CadQuery to generate 3D printable enclosures from component bounding boxes.
"""
import cadquery as cq
from pathlib import Path
from typing import Optional
import math

from .models import (
    EnclosureConfig, Component, ConnectorCutout, CustomCutout,
    LidStyle, WallFace, ConnectorType, CustomCutoutShape, Vector3, PartConfig,
    FootprintConfig
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


def compute_combined_bbox(components: list) -> tuple:
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


def _build_footprint(outer_w: float, outer_d: float, fp: FootprintConfig) -> cq.Workplane:
    """Build a 2D footprint workplane for the enclosure base/lid."""
    shape = fp.shape

    if shape == "rectangle":
        return cq.Workplane("XY").rect(outer_w, outer_d)

    elif shape == "l_shape":
        nw = fp.notch_w or outer_w * 0.4
        nd = fp.notch_d or outer_d * 0.4
        corner = fp.notch_corner
        hw, hd = outer_w / 2, outer_d / 2
        if corner == "top_right":
            pts = [(-hw, -hd), (hw, -hd), (hw, hd - nd), (hw - nw, hd - nd), (hw - nw, hd), (-hw, hd)]
        elif corner == "top_left":
            pts = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw + nw, hd), (-hw + nw, hd - nd), (-hw, hd - nd)]
        elif corner == "bottom_right":
            pts = [(-hw, -hd), (hw - nw, -hd), (hw - nw, -hd + nd), (hw, -hd + nd), (hw, hd), (-hw, hd)]
        else:  # bottom_left
            pts = [(-hw + nw, -hd), (-hw + nw, -hd + nd), (-hw, -hd + nd), (-hw, hd), (hw, hd), (hw, -hd)]
        return cq.Workplane("XY").polyline(pts).close()

    elif shape == "t_shape":
        tw = fp.tab_w or outer_w * 0.4
        td = fp.tab_d or outer_d * 0.3
        side = fp.tab_side
        hw, hd = outer_w / 2, outer_d / 2
        if side == "top":
            pts = [(-hw, -hd), (hw, -hd), (hw, hd - td), (tw / 2, hd - td), (tw / 2, hd),
                   (-tw / 2, hd), (-tw / 2, hd - td), (-hw, hd - td)]
        elif side == "bottom":
            pts = [(-tw / 2, -hd), (tw / 2, -hd), (tw / 2, -hd + td), (hw, -hd + td),
                   (hw, hd), (-hw, hd), (-hw, -hd + td), (-tw / 2, -hd + td)]
        elif side == "right":
            pts = [(-hw, -hd), (hw - td, -hd), (hw - td, -tw / 2), (hw, -tw / 2),
                   (hw, tw / 2), (hw - td, tw / 2), (hw - td, hd), (-hw, hd)]
        else:  # left
            pts = [(-hw + td, -hd), (hw, -hd), (hw, hd), (-hw + td, hd),
                   (-hw + td, tw / 2), (-hw, tw / 2), (-hw, -tw / 2), (-hw + td, -tw / 2)]
        return cq.Workplane("XY").polyline(pts).close()

    elif shape == "u_shape":
        nw = fp.u_notch_w or outer_w * 0.5
        nd = fp.u_notch_d or outer_d * 0.5
        side = fp.u_open_side
        hw, hd = outer_w / 2, outer_d / 2
        if side == "top":
            pts = [(-hw, -hd), (hw, -hd), (hw, hd), (nw / 2, hd), (nw / 2, hd - nd),
                   (-nw / 2, hd - nd), (-nw / 2, hd), (-hw, hd)]
        elif side == "bottom":
            pts = [(-hw, -hd), (-nw / 2, -hd), (-nw / 2, -hd + nd), (nw / 2, -hd + nd),
                   (nw / 2, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
        elif side == "right":
            pts = [(-hw, -hd), (hw, -hd), (hw, -nw / 2), (hw - nd, -nw / 2),
                   (hw - nd, nw / 2), (hw, nw / 2), (hw, hd), (-hw, hd)]
        else:  # left
            pts = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd), (-hw, nw / 2),
                   (-hw + nd, nw / 2), (-hw + nd, -nw / 2), (-hw, -nw / 2)]
        return cq.Workplane("XY").polyline(pts).close()

    elif shape == "plus":
        af = fp.arm_fraction
        hw, hd = outer_w / 2, outer_d / 2
        aw = outer_w * af / 2  # arm half-width
        ad = outer_d * af / 2
        pts = [
            (-aw, -hd), (aw, -hd), (aw, -ad), (hw, -ad), (hw, ad),
            (aw, ad), (aw, hd), (-aw, hd), (-aw, ad), (-hw, ad),
            (-hw, -ad), (-aw, -ad)
        ]
        return cq.Workplane("XY").polyline(pts).close()

    elif shape in ("hexagon", "octagon"):
        sides = 6 if shape == "hexagon" else 8
        r = min(outer_w, outer_d) / 2
        return cq.Workplane("XY").polygon(sides, r)

    # Fallback
    return cq.Workplane("XY").rect(outer_w, outer_d)


def _export_shape(shape, stl_path: Path):
    """Export shape to STL and attempt 3MF."""
    cq.exporters.export(shape, str(stl_path))
    threemf_path = stl_path.with_suffix(".3mf")
    try:
        cq.exporters.export(shape, str(threemf_path))
    except Exception:
        pass  # 3MF may not be supported in all CadQuery builds


def _apply_connector_cutout(
    shell: cq.Workplane,
    cutout: ConnectorCutout,
    inner_size: Vector3,
    wall_thickness: float,
    inner_center: Vector3,
    outer_h: float = None,
) -> cq.Workplane:
    """Apply a single connector cutout to the shell."""

    profile = get_profile(cutout.connector_type.value)
    is_round = profile.get("is_round", False)

    cut_w = profile.get("width", cutout.custom_width or 10)
    cut_h = profile.get("height", cutout.custom_height or 10)
    cut_d = wall_thickness + 2  # slightly deeper than wall to ensure clean cut

    face = cutout.face
    offset_x = cutout.offset_x
    offset_y = cutout.offset_y

    # Determine position and orientation based on face
    if face == WallFace.FRONT:
        pos_x = inner_center.x + offset_x
        pos_y = inner_center.y + inner_size.y / 2 + wall_thickness / 2
        pos_z = inner_center.z + offset_y
        wp = cq.Workplane("XZ").transformed(offset=(pos_x, pos_z, pos_y))
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.BACK:
        pos_x = inner_center.x + offset_x
        pos_y = inner_center.y - inner_size.y / 2 - wall_thickness / 2
        pos_z = inner_center.z + offset_y
        wp = cq.Workplane("XZ").transformed(offset=(pos_x, pos_z, pos_y))
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.RIGHT:
        pos_x = inner_center.x + inner_size.x / 2 + wall_thickness / 2
        pos_y = inner_center.y + offset_x
        pos_z = inner_center.z + offset_y
        wp = cq.Workplane("YZ").transformed(offset=(pos_y, pos_z, pos_x))
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.LEFT:
        pos_x = inner_center.x - inner_size.x / 2 - wall_thickness / 2
        pos_y = inner_center.y + offset_x
        pos_z = inner_center.z + offset_y
        wp = cq.Workplane("YZ").transformed(offset=(pos_y, pos_z, pos_x))
        if is_round:
            cut = wp.circle(profile["diameter"] / 2).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.TOP:
        # Cut from the top of the enclosure downward (-Z)
        pos_x = inner_center.x + offset_x
        pos_y = inner_center.y + offset_y
        pos_z = outer_h if outer_h is not None else inner_center.z + inner_size.z / 2
        wp = cq.Workplane("XY").transformed(offset=(pos_x, pos_y, pos_z))
        r = profile.get("diameter", min(cut_w, cut_h)) / 2
        if is_round:
            cut = wp.circle(r).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    elif face == WallFace.BOTTOM:
        # Cut from the floor upward (+Z)
        pos_x = inner_center.x + offset_x
        pos_y = inner_center.y + offset_y
        pos_z = 0
        wp = cq.Workplane("XY").transformed(offset=(pos_x, pos_y, pos_z))
        r = profile.get("diameter", min(cut_w, cut_h)) / 2
        if is_round:
            cut = wp.circle(r).extrude(cut_d, both=True)
        else:
            cut = wp.rect(cut_w, cut_h).extrude(cut_d, both=True)

    else:
        return shell

    shell = shell.cut(cut)
    return shell


def _apply_custom_cutout(
    shell: cq.Workplane,
    cutout: CustomCutout,
    inner_size: Vector3,
    wall_thickness: float,
    inner_center: Vector3,
    outer_h: float = None,
) -> cq.Workplane:
    """Apply a single custom cutout to the shell."""
    w = cutout.width
    h = cutout.height
    cut_d = cutout.depth if cutout.depth > 0 else wall_thickness + 2
    face = cutout.face
    shape = cutout.shape
    rot = cutout.rotation

    def make_profile(wp, shape, w, h):
        if shape == CustomCutoutShape.RECTANGLE:
            return wp.rect(w, h)
        elif shape == CustomCutoutShape.CIRCLE:
            return wp.circle(w / 2)
        elif shape == CustomCutoutShape.HEXAGON:
            return wp.polygon(6, w / 2)
        elif shape == CustomCutoutShape.TRIANGLE:
            return wp.polygon(3, w / 2)
        else:
            return wp.rect(w, h)

    try:
        if face == WallFace.FRONT:
            pos_x = inner_center.x + cutout.offset_x
            pos_y = inner_center.y + inner_size.y / 2 + wall_thickness / 2
            pos_z = inner_center.z + cutout.offset_y
            wp = cq.Workplane("XZ").transformed(offset=(pos_x, pos_z, pos_y), rotate=(0, rot, 0))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        elif face == WallFace.BACK:
            pos_x = inner_center.x + cutout.offset_x
            pos_y = inner_center.y - inner_size.y / 2 - wall_thickness / 2
            pos_z = inner_center.z + cutout.offset_y
            wp = cq.Workplane("XZ").transformed(offset=(pos_x, pos_z, pos_y), rotate=(0, rot, 0))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        elif face == WallFace.RIGHT:
            pos_x = inner_center.x + inner_size.x / 2 + wall_thickness / 2
            pos_y = inner_center.y + cutout.offset_x
            pos_z = inner_center.z + cutout.offset_y
            wp = cq.Workplane("YZ").transformed(offset=(pos_y, pos_z, pos_x), rotate=(rot, 0, 0))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        elif face == WallFace.LEFT:
            pos_x = inner_center.x - inner_size.x / 2 - wall_thickness / 2
            pos_y = inner_center.y + cutout.offset_x
            pos_z = inner_center.z + cutout.offset_y
            wp = cq.Workplane("YZ").transformed(offset=(pos_y, pos_z, pos_x), rotate=(rot, 0, 0))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        elif face == WallFace.TOP:
            pos_x = inner_center.x + cutout.offset_x
            pos_y = inner_center.y + cutout.offset_y
            pos_z = outer_h if outer_h is not None else inner_center.z + inner_size.z / 2
            wp = cq.Workplane("XY").transformed(offset=(pos_x, pos_y, pos_z), rotate=(0, 0, rot))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        elif face == WallFace.BOTTOM:
            pos_x = inner_center.x + cutout.offset_x
            pos_y = inner_center.y + cutout.offset_y
            pos_z = 0
            wp = cq.Workplane("XY").transformed(offset=(pos_x, pos_y, pos_z), rotate=(0, 0, rot))
            cut = make_profile(wp, shape, w, h).extrude(cut_d, both=True)

        else:
            return shell

        shell = shell.cut(cut)
    except Exception as e:
        print(f"Warning: Could not apply custom cutout ({shape}): {e}")

    return shell


def _apply_enclosure_style(
    base: cq.Workplane,
    style: str,
    outer_w: float,
    outer_d: float,
    outer_h: float,
    wall: float,
    floor: float,
) -> cq.Workplane:
    """Apply enclosure style post-processing (vented, ribbed)."""
    if style == "vented":
        slot_w = 2.0
        slot_h = outer_h * 0.6
        slot_z = outer_h / 2
        spacing = 8.0

        # Front/back walls — slots along X
        for y_sign in [1, -1]:
            wall_y = y_sign * outer_d / 2
            x = -outer_w / 2 + 4.0
            while x < outer_w / 2 - 4.0:
                try:
                    slot = (
                        cq.Workplane("XY")
                        .box(slot_w, wall + 2, slot_h)
                        .translate((x, wall_y, slot_z))
                    )
                    base = base.cut(slot)
                except Exception:
                    pass
                x += spacing

        # Left/right walls — slots along Y
        for x_sign in [1, -1]:
            wall_x = x_sign * outer_w / 2
            y = -outer_d / 2 + 4.0
            while y < outer_d / 2 - 4.0:
                try:
                    slot = (
                        cq.Workplane("XY")
                        .box(wall + 2, slot_w, slot_h)
                        .translate((wall_x, y, slot_z))
                    )
                    base = base.cut(slot)
                except Exception:
                    pass
                y += spacing

    elif style == "ribbed":
        rib_h = 3.0
        rib_d = 1.5
        rib_spacing = 15.0
        z = floor + rib_h / 2
        while z < outer_h - rib_h / 2:
            try:
                # Front/back ribs
                for y_side in [1, -1]:
                    rib = (
                        cq.Workplane("XY")
                        .box(outer_w + rib_d * 2, rib_d, rib_h)
                        .translate((0, y_side * (outer_d / 2 + rib_d / 2), z))
                    )
                    base = base.union(rib)
                # Left/right ribs
                for x_side in [1, -1]:
                    rib = (
                        cq.Workplane("XY")
                        .box(rib_d, outer_d + rib_d * 2, rib_h)
                        .translate((x_side * (outer_w / 2 + rib_d / 2), 0, z))
                    )
                    base = base.union(rib)
            except Exception:
                pass
            z += rib_spacing

    return base


def _add_pcb_standoffs(
    base: cq.Workplane,
    components: list,
    cavity_center_x: float,
    cavity_center_y: float,
    floor: float,
) -> cq.Workplane:
    """Add PCB standoffs for components with is_pcb=True."""
    for comp in components:
        if not comp.is_pcb:
            continue
        gz = comp.ground_z
        if gz <= 0:
            continue

        outer_r = comp.pcb_screw_diameter * 2.5 / 2
        inner_r = comp.pcb_screw_diameter / 2
        standoff_h = gz

        # Component center in CadQuery XY space
        cq_cx = comp.position.x - cavity_center_x
        cq_cy = comp.position.y - cavity_center_y

        if comp.standoff_positions:
            positions = [(p["x"] + cq_cx, p["y"] + cq_cy) for p in comp.standoff_positions]
        else:
            # Auto-place at 4 corners, inset 3mm from component edges
            half_w = (comp.bbox_max.x - comp.bbox_min.x) / 2
            half_d = (comp.bbox_max.y - comp.bbox_min.y) / 2
            inset = 3.0
            hw = max(half_w - inset, 1.0)
            hd = max(half_d - inset, 1.0)
            positions = [
                (cq_cx + hw, cq_cy + hd),
                (cq_cx + hw, cq_cy - hd),
                (cq_cx - hw, cq_cy + hd),
                (cq_cx - hw, cq_cy - hd),
            ]

        for (sx, sy) in positions:
            try:
                standoff = (
                    cq.Workplane("XY")
                    .cylinder(standoff_h, outer_r)
                    .translate((sx, sy, floor + standoff_h / 2))
                )
                drill = (
                    cq.Workplane("XY")
                    .cylinder(standoff_h + 1, inner_r)
                    .translate((sx, sy, floor + standoff_h / 2))
                )
                base = base.union(standoff).cut(drill)
            except Exception as e:
                print(f"Warning: PCB standoff skipped at ({sx:.1f},{sy:.1f}): {e}")

    return base


def _build_lid_screws(
    lid: cq.Workplane,
    lid_style: str,
    lid_hole_style: str,
    lid_t: float,
    screw_r: float,
    inner_w: float,
    inner_d: float,
    boss_diameter: float,
    wall: float,
) -> cq.Workplane:
    """Apply screw holes to the lid according to lid_hole_style."""
    if lid_style != "screws":
        return lid

    inset = boss_diameter / 2 + wall

    for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
        bx = sx * (inner_w / 2 - inset)
        by = sy * (inner_d / 2 - inset)

        if lid_hole_style == "closed":
            pass  # no hole

        elif lid_hole_style == "countersunk":
            # Wider pocket at top for screw head, then narrow shaft
            head_r = screw_r * 1.8
            pocket_depth = min(2.0, lid_t - 0.5)
            shaft_depth = lid_t - pocket_depth - 0.3  # leave 0.3mm floor
            if shaft_depth <= 0:
                # lid too thin, fall back to through
                hole = (
                    cq.Workplane("XY")
                    .cylinder(lid_t + 1, screw_r)
                    .translate((bx, by, lid_t / 2))
                )
                lid = lid.cut(hole)
            else:
                # Countersink pocket from top
                pocket = (
                    cq.Workplane("XY")
                    .cylinder(pocket_depth + 1, head_r)
                    .translate((bx, by, lid_t - pocket_depth / 2))
                )
                # Shaft hole from bottom (not breaking through)
                shaft = (
                    cq.Workplane("XY")
                    .cylinder(shaft_depth + 1, screw_r)
                    .translate((bx, by, shaft_depth / 2))
                )
                lid = lid.cut(pocket).cut(shaft)

        else:  # "through" — default
            hole = (
                cq.Workplane("XY")
                .cylinder(lid_t + 1, screw_r)
                .translate((bx, by, lid_t / 2))
            )
            lid = lid.cut(hole)

    return lid


def _get_part(config: EnclosureConfig, part_name: str) -> PartConfig:
    """Get part config, falling back to defaults if not present."""
    parts = config.parts
    if isinstance(parts, dict):
        return parts.get(part_name, PartConfig())
    return PartConfig()


def _apply_edges(shell: cq.Workplane, part_config: PartConfig, fillet_r: float) -> cq.Workplane:
    """Apply fillet or chamfer to vertical edges based on part config."""
    edge_style = getattr(part_config, "edge_style", "fillet")
    chamfer_size = getattr(part_config, "chamfer_size", 1.5)

    if edge_style == "fillet" and fillet_r > 0:
        try:
            shell = shell.edges("|Z").fillet(fillet_r)
        except Exception:
            pass
    elif edge_style == "chamfer" and chamfer_size > 0:
        try:
            shell = shell.edges("|Z").chamfer(chamfer_size)
        except Exception:
            pass
    # "none": no edge treatment
    return shell


def generate_enclosure(config: EnclosureConfig, output_dir: str = "./output") -> dict:
    """
    Main function: generate enclosure from config.

    Returns paths to generated STL files:
    {
        "base": "path/to/enclosure_base.stl",
        "lid": "path/to/enclosure_lid.stl"   (if lid_style != NONE)
        "tray": "path/to/enclosure_tray.stl" (if tray enabled)
        "bracket": "path/to/enclosure_bracket.stl" (if bracket enabled)
    }
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

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

    # --- 1. Load all components and compute bboxes ---
    loaded = []
    for comp in config.components:
        loaded.append(load_component_bbox(comp))

    # --- 2. Combined bounding box ---
    bbox_min, bbox_max = compute_combined_bbox(loaded)

    cavity_center_x = (bbox_min.x + bbox_max.x) / 2
    cavity_center_y = (bbox_min.y + bbox_max.y) / 2

    # Inner cavity dimensions (components + padding)
    inner_w = (bbox_max.x - bbox_min.x) + config.padding_x * 2
    inner_d = (bbox_max.y - bbox_min.y) + config.padding_y * 2
    inner_h = (bbox_max.z - bbox_min.z) + config.padding_z * 2

    inner_size = Vector3(inner_w, inner_d, inner_h)

    floor = config.floor_thickness
    lid_t = config.lid_thickness

    # Use effective wall (may be overridden by style)
    outer_w = inner_w + wall * 2
    outer_d = inner_d + wall * 2
    outer_h = inner_h + floor  # floor at bottom, open top (lid closes it)

    # Center of inner cavity
    inner_center = Vector3(0, 0, floor + inner_h / 2)

    # Boss height from screw_length
    boss_h = max(config.screw_length - lid_t, 3.0)

    # --- 3. Build the base shell using footprint ---
    footprint = _build_footprint(outer_w, outer_d, config.footprint)
    base = footprint.extrude(outer_h)

    cavity_fp = _build_footprint(inner_w, inner_d, config.footprint)
    cavity = cavity_fp.extrude(inner_h).translate((0, 0, floor))
    base = base.cut(cavity)

    base = _apply_edges(base, base_part, eff_fillet)

    # --- 4. Add screw bosses (for SCREWS lid style, not minimal) ---
    if config.lid_style == LidStyle.SCREWS and style != "minimal":
        boss_r = config.boss_diameter / 2
        screw_r = config.screw_diameter / 2
        inset = boss_r + wall

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

    # --- 5. Add PCB standoffs ---
    if config.pcb_standoffs_enabled:
        base = _add_pcb_standoffs(base, loaded, cavity_center_x, cavity_center_y, floor)

    # --- 6. Apply connector cutouts to base ---
    for cutout in config.cutouts:
        try:
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center, outer_h)
        except Exception as e:
            print(f"Warning: Could not apply cutout {cutout.connector_type}: {e}")

    # --- 7. Apply custom cutouts to base ---
    for cutout in config.custom_cutouts:
        base = _apply_custom_cutout(base, cutout, inner_size, wall, inner_center, outer_h)

    # --- 8. Apply enclosure style (vented/ribbed) ---
    base = _apply_enclosure_style(base, style, outer_w, outer_d, outer_h, wall, floor)

    # --- 9. Export base ---
    base_path = output_path / "enclosure_base.stl"
    _export_shape(base, base_path)
    result = {"base": str(base_path)}
    if (output_path / "enclosure_base.3mf").exists():
        result["base_3mf"] = str(output_path / "enclosure_base.3mf")

    # --- 10. Generate lid ---
    if config.lid_style != LidStyle.NONE:
        lid_fillet = lid_part.fillet_radius
        lid_hole_style = lid_part.lid_hole_style if lid_part.lid_hole_style else config.lid_hole_style
        if base_part.style == "rounded" or lid_part.style == "rounded":
            lid_fillet = 3.0
        if lid_part.style == "minimal":
            lid_fillet = 0.0

        lid_fp = _build_footprint(outer_w, outer_d, config.footprint)

        if config.lid_style == LidStyle.SCREWS:
            lid = lid_fp.extrude(lid_t)
            lid = _apply_edges(lid, lid_part, lid_fillet)

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
            lid = lid_fp.extrude(lid_t)
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

    # --- 11. Generate tray (optional) ---
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

    # --- 12. Generate bracket (optional) ---
    if bracket_part.enabled:
        bracket_wall = bracket_part.wall_thickness if bracket_part.wall_thickness else wall
        hole_d = bracket_part.bracket_hole_diameter
        bracket_w = 30.0
        bracket_h = outer_h * 0.6
        bracket_t = bracket_wall

        back_plate = (
            cq.Workplane("XY")
            .box(bracket_w, bracket_t, bracket_h)
            .translate((0, 0, bracket_h / 2))
        )

        flange_d = 12.0
        flange = (
            cq.Workplane("XY")
            .box(bracket_w, flange_d, bracket_t)
            .translate((0, flange_d / 2, bracket_h))
        )
        bracket = back_plate.union(flange)

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

    print(f"[OK] Enclosure generated: {result}")
    return result
