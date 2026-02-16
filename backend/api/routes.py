"""
ShellForge API - Route handlers.
"""
import uuid
import shutil
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from .schemas import EnclosureRequestSchema, EnclosureResponseSchema
from ..engine.models import (
    EnclosureConfig, ConnectorCutout, CustomCutout,
    LidStyle, WallFace, ConnectorType, CustomCutoutShape, PartConfig
)
from ..engine.bbox_only import generate_from_manual_bbox
from ..connectors.profiles import list_connectors

router = APIRouter()

# Temp output directory for generated files
OUTPUT_BASE = Path("./output/jobs")
OUTPUT_BASE.mkdir(parents=True, exist_ok=True)

# Import directory for uploaded models
IMPORTS_DIR = Path("./output/imports")
IMPORTS_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/connectors", summary="List available connector types")
def get_connectors():
    """Returns all supported connector cutout profiles."""
    return {"connectors": list_connectors()}


@router.post("/import", summary="Import STL or STEP file")
async def import_model(file: UploadFile = File(...)):
    """
    Accept an STL or STEP file upload.
    - STL: compute bbox with trimesh, serve the file as-is
    - STEP: load with CadQuery, compute bbox, export to STL
    Returns: {name, width, depth, height, stl_url, job_id}
    """
    filename = file.filename or "model"
    ext = Path(filename).suffix.lower()

    if ext not in (".stl", ".step", ".stp"):
        raise HTTPException(status_code=400, detail="Only .stl, .step, .stp files supported")

    job_id = str(uuid.uuid4())[:8]
    job_dir = IMPORTS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    upload_path = job_dir / f"original{ext}"
    content = await file.read()
    with open(upload_path, "wb") as f:
        f.write(content)

    name = Path(filename).stem
    stl_out = job_dir / "model.stl"

    try:
        if ext == ".stl":
            import trimesh
            mesh = trimesh.load(str(upload_path), force="mesh")
            bbox = mesh.bounding_box.extents  # [x, y, z] extents
            width = float(bbox[0])
            depth = float(bbox[1])
            height = float(bbox[2])
            # Copy as-is for preview
            shutil.copy(str(upload_path), str(stl_out))

        else:
            # STEP — load with CadQuery
            import cadquery as cq
            result = cq.importers.importStep(str(upload_path))
            bb = result.val().BoundingBox()
            width = float(bb.xmax - bb.xmin)
            depth = float(bb.ymax - bb.ymin)
            height = float(bb.zmax - bb.zmin)
            cq.exporters.export(result, str(stl_out))

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

    return {
        "name": name,
        "width": round(width, 2),
        "depth": round(depth, 2),
        "height": round(height, 2),
        "stl_url": f"http://localhost:8000/api/v1/model/{job_id}",
        "job_id": job_id,
    }


@router.get("/model/{job_id}", summary="Serve imported model STL for preview")
def get_model_stl(job_id: str):
    """Serve the STL file for a given import job."""
    stl_path = IMPORTS_DIR / job_id / "model.stl"
    if not stl_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")
    return FileResponse(
        path=str(stl_path),
        media_type="model/stl",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.post("/detect-holes/{job_id}", summary="Detect mounting holes in imported STEP model")
def detect_mounting_holes(
    job_id: str,
    min_diameter: float = 1.5,
    max_diameter: float = 5.0
):
    """
    Detect cylindrical mounting holes in an imported STEP model.
    Returns list of {x, y, diameter} positions.
    """
    # Look for the original STEP file
    step_path = None
    for ext in (".step", ".stp"):
        candidate = IMPORTS_DIR / job_id / f"original{ext}"
        if candidate.exists():
            step_path = candidate
            break

    if step_path is None:
        raise HTTPException(
            status_code=404,
            detail="No STEP file found for this job. Only STEP files support hole detection."
        )

    try:
        holes = _find_holes(step_path, min_diameter / 2, max_diameter / 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hole detection failed: {str(e)}")

    return {"holes": holes, "count": len(holes)}


def _find_holes(step_path: Path, min_r: float, max_r: float) -> list:
    """
    Detect cylindrical faces (holes) in a STEP file using CadQuery/OCC.
    Only imports OCC inside this function to avoid module-level import errors.
    """
    try:
        import cadquery as cq
        from OCP.BRep import BRep_Tool
        from OCP.TopAbs import TopAbs_FACE
        from OCP.TopExp import TopExp_Explorer
        from OCP.GeomAbs import GeomAbs_Cylinder

        shape = cq.importers.importStep(str(step_path))
        holes = []
        explorer = TopExp_Explorer(shape.val().wrapped, TopAbs_FACE)
        while explorer.More():
            face = explorer.Current()
            surf = BRep_Tool.Surface_s(face)
            if surf.GetType() == GeomAbs_Cylinder:
                cyl = surf.Cylinder()
                r = cyl.Radius()
                if min_r <= r <= max_r:
                    ax = cyl.Axis()
                    loc = ax.Location()
                    holes.append({
                        "x": round(loc.X(), 2),
                        "y": round(loc.Y(), 2),
                        "diameter": round(r * 2, 2),
                    })
            explorer.Next()

        # Deduplicate
        seen = set()
        unique = []
        for h in holes:
            key = (round(h["x"], 1), round(h["y"], 1))
            if key not in seen:
                seen.add(key)
                unique.append(h)
        return unique

    except ImportError:
        # OCP not available — return empty result
        return []


@router.post("/generate", response_model=EnclosureResponseSchema, summary="Generate enclosure")
def generate_enclosure(request: EnclosureRequestSchema):
    """
    Generate a 3D printable enclosure from component dimensions.

    Returns download links for the base and lid STL files.
    """
    job_id = str(uuid.uuid4())[:8]
    job_dir = OUTPUT_BASE / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Build components list
    components_bbox = [
        {
            "name": c.name,
            "width": c.width,
            "depth": c.depth,
            "height": c.height,
            "x": c.x,
            "y": c.y,
            "z": c.ground_z if c.ground_z != 0 else c.z,
            "ground_z": c.ground_z,
            "is_pcb": c.is_pcb,
            "pcb_screw_diameter": c.pcb_screw_diameter,
            "standoff_positions": c.standoff_positions,
        }
        for c in request.components
    ]

    # Build cutouts list
    cutouts = []
    for co in request.cutouts:
        try:
            cutouts.append(ConnectorCutout(
                connector_type=ConnectorType(co.connector_type),
                face=WallFace(co.face.value),
                offset_x=co.offset_x,
                offset_y=co.offset_y,
                custom_width=co.custom_width,
                custom_height=co.custom_height,
            ))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid connector/face: {e}")

    # Build custom cutouts list
    custom_cutouts = []
    for cc in request.custom_cutouts:
        try:
            custom_cutouts.append(CustomCutout(
                shape=CustomCutoutShape(cc.shape.value),
                face=WallFace(cc.face.value),
                width=cc.width,
                height=cc.height,
                depth=cc.depth,
                offset_x=cc.offset_x,
                offset_y=cc.offset_y,
                rotation=cc.rotation,
            ))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid custom cutout: {e}")

    # Build per-part configs
    def _schema_to_part(ps) -> PartConfig:
        return PartConfig(
            style=ps.style,
            fillet_radius=ps.fillet_radius,
            wall_thickness=ps.wall_thickness,
            lid_hole_style=ps.lid_hole_style,
            tray_z=ps.tray_z,
            tray_thickness=ps.tray_thickness,
            bracket_hole_diameter=ps.bracket_hole_diameter,
            enabled=ps.enabled,
        )

    parts_config = {
        "base": _schema_to_part(request.parts.base),
        "lid": _schema_to_part(request.parts.lid),
        "tray": _schema_to_part(request.parts.tray),
        "bracket": _schema_to_part(request.parts.bracket),
    }

    # Build enclosure config
    config = EnclosureConfig(
        padding_x=request.padding_x,
        padding_y=request.padding_y,
        padding_z=request.padding_z,
        wall_thickness=request.wall_thickness,
        floor_thickness=request.floor_thickness,
        lid_thickness=request.lid_thickness,
        lid_style=LidStyle(request.lid_style.value),
        fillet_radius=request.fillet_radius,
        screw_diameter=request.screw_diameter,
        screw_length=request.screw_length,
        lid_hole_style=request.lid_hole_style,
        enclosure_style=request.enclosure_style,
        pcb_standoffs_enabled=request.pcb_standoffs_enabled,
        parts=parts_config,
        cutouts=cutouts,
        custom_cutouts=custom_cutouts,
    )

    # Generate
    try:
        result = generate_from_manual_bbox(
            components_bbox=components_bbox,
            config=config,
            output_dir=str(job_dir),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")

    # Compute dimensions for response
    all_x = [c["x"] - c["width"]/2 for c in components_bbox] + [c["x"] + c["width"]/2 for c in components_bbox]
    all_y = [c["y"] - c["depth"]/2 for c in components_bbox] + [c["y"] + c["depth"]/2 for c in components_bbox]
    all_z = [c.get("ground_z", c.get("z", 0)) for c in components_bbox] + [c.get("ground_z", c.get("z", 0)) + c["height"] for c in components_bbox]

    inner_w = (max(all_x) - min(all_x)) + request.padding_x * 2
    inner_d = (max(all_y) - min(all_y)) + request.padding_y * 2
    inner_h = (max(all_z) - min(all_z)) + request.padding_z * 2
    wall = request.wall_thickness

    files = {}
    if "base" in result:
        files["base"] = f"/download/{job_id}/base"
    if "lid" in result:
        files["lid"] = f"/download/{job_id}/lid"
    if "tray" in result:
        files["tray"] = f"/download/{job_id}/tray"
    if "bracket" in result:
        files["bracket"] = f"/download/{job_id}/bracket"

    return EnclosureResponseSchema(
        success=True,
        message="Enclosure generated successfully",
        job_id=job_id,
        files=files,
        dimensions={
            "inner": {"width": round(inner_w, 2), "depth": round(inner_d, 2), "height": round(inner_h, 2)},
            "outer": {"width": round(inner_w + wall*2, 2), "depth": round(inner_d + wall*2, 2), "height": round(inner_h + request.floor_thickness, 2)},
        }
    )


@router.get("/download/{job_id}/{part}", summary="Download STL file")
def download_stl(job_id: str, part: str):
    """
    Download generated STL file.
    - part: 'base', 'lid', 'tray', or 'bracket'
    """
    if part not in ("base", "lid", "tray", "bracket"):
        raise HTTPException(status_code=400, detail="part must be 'base', 'lid', 'tray', or 'bracket'")

    file_path = OUTPUT_BASE / job_id / f"enclosure_{part}.stl"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Job may have expired.")

    return FileResponse(
        path=str(file_path),
        media_type="application/octet-stream",
        filename=f"shellforge_{part}.stl",
    )


@router.get("/health", summary="Health check")
def health():
    return {"status": "ok", "service": "ShellForge API"}
