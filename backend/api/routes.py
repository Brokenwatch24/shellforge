"""
ShellForge API - Route handlers.
"""
import uuid
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .schemas import EnclosureRequestSchema, EnclosureResponseSchema
from ..engine.models import (
    EnclosureConfig, ConnectorCutout, LidStyle, WallFace, ConnectorType
)
from ..engine.bbox_only import generate_from_manual_bbox
from ..connectors.profiles import list_connectors

router = APIRouter()

# Temp output directory for generated files
OUTPUT_BASE = Path("./output/jobs")
OUTPUT_BASE.mkdir(parents=True, exist_ok=True)


@router.get("/connectors", summary="List available connector types")
def get_connectors():
    """Returns all supported connector cutout profiles."""
    return {"connectors": list_connectors()}


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
            "z": c.z,
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
        cutouts=cutouts,
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
    from ..engine.models import Vector3
    all_x = [c["x"] - c["width"]/2 for c in components_bbox] + [c["x"] + c["width"]/2 for c in components_bbox]
    all_y = [c["y"] - c["depth"]/2 for c in components_bbox] + [c["y"] + c["depth"]/2 for c in components_bbox]
    all_z = [c["z"] for c in components_bbox] + [c["z"] + c["height"] for c in components_bbox]

    inner_w = (max(all_x) - min(all_x)) + request.padding_x * 2
    inner_d = (max(all_y) - min(all_y)) + request.padding_y * 2
    inner_h = (max(all_z) - min(all_z)) + request.padding_z * 2
    wall = request.wall_thickness

    files = {}
    if "base" in result:
        files["base"] = f"/download/{job_id}/base"
    if "lid" in result:
        files["lid"] = f"/download/{job_id}/lid"

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
    - part: 'base' or 'lid'
    """
    if part not in ("base", "lid"):
        raise HTTPException(status_code=400, detail="part must be 'base' or 'lid'")

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
