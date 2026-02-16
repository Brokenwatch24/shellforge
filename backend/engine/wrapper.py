"""
ShellForge - True geometric wrapper enclosure engine.
Uses shapely for 2D footprint computation, then extrudes to 3D with CadQuery.

The enclosure shape EMERGES from the component arrangement:
  - L-shaped components -> L-shaped enclosure
  - Diagonal components -> diagonal-fitting enclosure
  - T-shaped arrangement -> T-shaped enclosure
"""
import math
from pathlib import Path
import cadquery as cq
from shapely.geometry import Polygon, MultiPolygon, box as shapely_box
from shapely.ops import unary_union
from shapely.affinity import rotate as shapely_rotate, translate as shapely_translate

from .models import EnclosureConfig, LidStyle, Vector3


def _component_footprint(comp_spec: dict) -> Polygon:
    """
    Get the 2D footprint (shapely Polygon) of a component in world XY space.
    Accounts for rotation around Z axis (rot_y in engineering = rotation in plan view).
    """
    cx = comp_spec.get("x", 0)
    cy = comp_spec.get("y", 0)
    w = comp_spec["width"]
    d = comp_spec["depth"]
    rot_y = comp_spec.get("rot_y", 0)  # degrees, rotation around vertical axis

    # Rectangle centered at origin
    rect = shapely_box(-w / 2, -d / 2, w / 2, d / 2)

    # Rotate around component center
    if rot_y:
        rect = shapely_rotate(rect, rot_y, origin=(0, 0), use_radians=False)

    # Translate to world position
    rect = shapely_translate(rect, cx, cy)
    return rect


def _shapely_to_cq_wire(polygon, workplane="XY"):
    """Convert a shapely Polygon exterior to a closed CadQuery wire on the given workplane."""
    coords = list(polygon.exterior.coords)[:-1]  # drop duplicate last point
    if len(coords) < 3:
        raise ValueError("Polygon has too few points")
    pts = [(float(x), float(y)) for x, y in coords]
    return cq.Workplane(workplane).polyline(pts).close()


def generate_wrapper_enclosure(
    components_spec: list,
    config: EnclosureConfig,
    output_dir: str = "./output"
) -> dict:
    """
    Generate a true geometric wrapper enclosure.

    The enclosure shape is derived from the UNION of all component footprints,
    offset by padding and wall thickness. The result perfectly fits the
    component arrangement — NOT a simple bounding box.

    Args:
        components_spec: List of component dicts with width/depth/height/x/y/ground_z/rot_y
        config: EnclosureConfig with padding, wall thickness, lid style, etc.
        output_dir: Directory to write output STL/3MF files

    Returns:
        dict with keys 'base', optionally 'base_3mf', 'lid', 'lid_3mf'
    """
    if not components_spec:
        raise ValueError("No components provided")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # --- 1. Build 2D footprint union ---
    footprints = [_component_footprint(c) for c in components_spec]
    union_footprint = unary_union(footprints)

    # Handle MultiPolygon (disconnected components) -- use convex hull to connect them
    if union_footprint.geom_type == "MultiPolygon":
        union_footprint = union_footprint.convex_hull

    # --- 2. Compute height range ---
    min_z = min(c.get("ground_z", 0) for c in components_spec)
    max_z = max(c.get("ground_z", 0) + c["height"] for c in components_spec)
    inner_h = (max_z - min_z) + config.padding_z * 2
    outer_h = inner_h + config.floor_thickness

    # --- 3. Compute offset polygons ---
    pad = max(config.padding_x, config.padding_y)  # use max for uniform offset
    wall = config.wall_thickness

    # Inner cavity footprint (components + padding) -- square corners (join_style=2, cap_style=3)
    cavity_poly = union_footprint.buffer(pad, cap_style=3, join_style=2)
    # Outer shell footprint (cavity + walls)
    outer_poly = cavity_poly.buffer(wall, cap_style=3, join_style=2)

    # Apply fillet if configured (buffer/debuffer trick)
    if config.fillet_radius > 0:
        r = config.fillet_radius
        outer_poly = (
            outer_poly
            .buffer(-r, cap_style=3, join_style=2)
            .buffer(r, cap_style=1, join_style=1)
        )
        cavity_poly = (
            cavity_poly
            .buffer(-r / 2, cap_style=3, join_style=2)
            .buffer(r / 2, cap_style=1, join_style=1)
        )

    # --- 4. Build CadQuery base shell ---
    # Outer solid extrusion
    outer_wire = _shapely_to_cq_wire(outer_poly)
    base = outer_wire.extrude(outer_h)

    # Subtract inner cavity (from top, keeping floor intact)
    cavity_wire = _shapely_to_cq_wire(cavity_poly)
    cavity_solid = cavity_wire.extrude(inner_h).translate((0, 0, config.floor_thickness))
    base = base.cut(cavity_solid)

    # --- 5. PCB standoffs ---
    if config.pcb_standoffs_enabled:
        for comp in components_spec:
            if comp.get("is_pcb") and comp.get("ground_z", 0) > 0:
                boss_r = comp.get("pcb_screw_diameter", 3.0) * 1.25
                screw_r = comp.get("pcb_screw_diameter", 3.0) / 2
                gz = comp.get("ground_z", 0)
                cx = comp.get("x", 0)
                cy = comp.get("y", 0)
                w_comp = comp["width"]
                d_comp = comp["depth"]
                inset = boss_r * 1.5
                for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                    bx = cx + sx * (w_comp / 2 - inset)
                    by = cy + sy * (d_comp / 2 - inset)
                    boss = (
                        cq.Workplane("XY")
                        .cylinder(gz, boss_r)
                        .translate((bx, by, gz / 2))
                    )
                    hole = (
                        cq.Workplane("XY")
                        .cylinder(gz + 1, screw_r)
                        .translate((bx, by, gz / 2))
                    )
                    base = base.union(boss).cut(hole)

    # --- 6. Connector and custom cutouts ---
    # Import cut functions from generator (avoids circular import by deferring)
    from .generator import _apply_connector_cutout, _apply_custom_cutout

    # Compute outer bounding box for cutout positioning
    bb = outer_poly.bounds  # (minx, miny, maxx, maxy)
    outer_w = bb[2] - bb[0]
    outer_d = bb[3] - bb[1]
    inner_w = outer_w - wall * 2
    inner_d = outer_d - wall * 2

    inner_size = Vector3(inner_w, inner_d, inner_h)
    inner_center = Vector3(
        (bb[0] + bb[2]) / 2,
        (bb[1] + bb[3]) / 2,
        config.floor_thickness + inner_h / 2,
    )

    for cutout in config.cutouts:
        try:
            base = _apply_connector_cutout(base, cutout, inner_size, wall, inner_center)
        except Exception as e:
            print(f"[WARN] Connector cutout skipped: {e}")

    for custom in config.custom_cutouts:
        try:
            base = _apply_custom_cutout(base, custom, inner_size, wall, inner_center)
        except Exception as e:
            print(f"[WARN] Custom cutout skipped: {e}")

    # --- 7. Export base ---
    base_path = output_path / "enclosure_base.stl"
    cq.exporters.export(base, str(base_path))
    result = {"base": str(base_path)}

    # Try 3MF export (may not be supported in all CadQuery builds)
    try:
        base_3mf = output_path / "enclosure_base.3mf"
        cq.exporters.export(base, str(base_3mf))
        result["base_3mf"] = str(base_3mf)
    except Exception:
        pass

    # --- 8. Generate lid ---
    if config.lid_style != LidStyle.NONE:
        # Lid uses outer footprint shape
        lid_wire = _shapely_to_cq_wire(outer_poly)
        lid = lid_wire.extrude(config.lid_thickness)

        # Fillet lid vertical edges if requested
        if config.fillet_radius > 0:
            try:
                lid = lid.edges("|Z").fillet(config.fillet_radius)
            except Exception:
                pass

        # Screw holes in lid
        if config.lid_style == LidStyle.SCREWS:
            boss_r = config.boss_diameter / 2
            screw_r = config.screw_diameter / 2
            inset_val = boss_r + wall
            cx_center = (bb[0] + bb[2]) / 2
            cy_center = (bb[1] + bb[3]) / 2
            for sx, sy in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                bx = cx_center + sx * (inner_w / 2 - inset_val)
                by = cy_center + sy * (inner_d / 2 - inset_val)
                hole = (
                    cq.Workplane("XY")
                    .cylinder(config.lid_thickness + 1, screw_r)
                    .translate((bx, by, config.lid_thickness / 2))
                )
                lid = lid.cut(hole)

        lid_path = output_path / "enclosure_lid.stl"
        cq.exporters.export(lid, str(lid_path))
        result["lid"] = str(lid_path)

        try:
            lid_3mf = output_path / "enclosure_lid.3mf"
            cq.exporters.export(lid, str(lid_3mf))
            result["lid_3mf"] = str(lid_3mf)
        except Exception:
            pass

    # Report dimensions (no emoji - Windows cp1252 safe)
    outer_bounds = outer_poly.bounds
    print(
        f"[OK] Wrapper enclosure: "
        f"{outer_bounds[2]-outer_bounds[0]:.1f} x "
        f"{outer_bounds[3]-outer_bounds[1]:.1f} x "
        f"{outer_h:.1f} mm"
    )
    print(f"[OK] Output: {result}")
    return result
