"""
ShellForge API - Request/Response schemas (Pydantic models).
These define exactly what JSON the frontend sends and what we return.
"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class LidStyleSchema(str, Enum):
    SCREWS = "screws"
    SNAP = "snap"
    NONE = "none"


class WallFaceSchema(str, Enum):
    FRONT = "front"
    BACK = "back"
    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    BOTTOM = "bottom"


class CustomCutoutShapeSchema(str, Enum):
    RECTANGLE = "rectangle"
    CIRCLE = "circle"
    HEXAGON = "hexagon"
    TRIANGLE = "triangle"


class ComponentManualSchema(BaseModel):
    """A component defined by its dimensions (no 3D file needed)."""
    name: str = Field(..., example="ESP32 Dev Board")
    width: float = Field(..., gt=0, example=28.0, description="mm")
    depth: float = Field(..., gt=0, example=55.0, description="mm")
    height: float = Field(..., gt=0, example=12.0, description="mm")
    x: float = Field(0.0, example=0.0, description="Position offset X in mm")
    y: float = Field(0.0, example=0.0, description="Position offset Y in mm")
    z: float = Field(0.0, example=0.0, description="Position offset Z in mm")
    # PCB fields
    is_pcb: bool = Field(False, description="Is this a PCB? Generates standoffs.")
    pcb_screw_diameter: float = Field(3.0, description="PCB screw hole diameter (mm)")
    ground_z: float = Field(0.0, description="Vertical offset from floor (mm)")
    standoff_positions: list = Field(default_factory=list, description="[{x,y}] local coords")


class ConnectorCutoutSchema(BaseModel):
    """A connector hole to cut into a wall."""
    connector_type: str = Field(..., example="usb_c")
    face: WallFaceSchema = Field(..., example="front")
    offset_x: float = Field(0.0, description="Horizontal offset from face center (mm)")
    offset_y: float = Field(0.0, description="Vertical offset from face center (mm)")
    custom_width: Optional[float] = Field(None, description="Only for connector_type=custom")
    custom_height: Optional[float] = Field(None, description="Only for connector_type=custom")


class CustomCutoutSchema(BaseModel):
    """A custom-shaped hole in a wall."""
    shape: CustomCutoutShapeSchema = Field(..., example="rectangle")
    face: WallFaceSchema = Field(..., example="front")
    width: float = Field(..., gt=0, description="Width in mm")
    height: float = Field(10.0, description="Height in mm (ignored for circle)")
    depth: float = Field(0.0, description="Cut depth in mm; 0 = auto (wall_thickness+2)")
    offset_x: float = Field(0.0, description="Horizontal offset from face center (mm)")
    offset_y: float = Field(0.0, description="Vertical offset from face center (mm)")
    rotation: float = Field(0.0, description="Rotation in degrees")


class PartConfigSchema(BaseModel):
    style: str = "classic"
    fillet_radius: float = 1.5
    wall_thickness: float = 2.5
    lid_hole_style: str = "countersunk"
    tray_z: float = 0.0
    tray_thickness: float = 2.0
    bracket_hole_diameter: float = 4.0
    enabled: bool = True


class PartsSchema(BaseModel):
    base: PartConfigSchema = PartConfigSchema()
    lid: PartConfigSchema = PartConfigSchema()
    tray: PartConfigSchema = PartConfigSchema(enabled=False)
    bracket: PartConfigSchema = PartConfigSchema(enabled=False)


class EnclosureRequestSchema(BaseModel):
    """Full request body to generate an enclosure."""
    components: list[ComponentManualSchema] = Field(
        ...,
        min_length=1,
        example=[
            {"name": "ESP32", "width": 28, "depth": 55, "height": 12},
        ]
    )
    cutouts: list[ConnectorCutoutSchema] = Field(
        default=[],
        example=[{"connector_type": "usb_c", "face": "front"}]
    )
    custom_cutouts: list[CustomCutoutSchema] = Field(
        default=[],
        description="Custom-shaped cutouts in walls"
    )

    # Enclosure config
    padding_x: float = Field(3.0, ge=0, description="Padding around components X (mm)")
    padding_y: float = Field(3.0, ge=0, description="Padding around components Y (mm)")
    padding_z: float = Field(3.0, ge=0, description="Padding around components Z (mm)")
    wall_thickness: float = Field(2.5, ge=1.0, le=10.0)
    floor_thickness: float = Field(2.5, ge=1.0, le=10.0)
    lid_thickness: float = Field(2.0, ge=1.0, le=10.0)
    lid_style: LidStyleSchema = Field(LidStyleSchema.SCREWS)
    fillet_radius: float = Field(1.5, ge=0, le=5.0)
    screw_diameter: float = Field(3.0, ge=2.0, le=5.0)

    # New config fields
    screw_length: float = Field(12.0, description="Screw length in mm (affects boss height)")
    lid_hole_style: str = Field("countersunk", description="through | countersunk | closed")
    enclosure_style: str = Field("classic", description="classic | vented | rounded | ribbed | minimal")
    pcb_standoffs_enabled: bool = Field(True, description="Auto-generate PCB standoffs")

    # Per-part configs
    parts: PartsSchema = PartsSchema()


class EnclosureResponseSchema(BaseModel):
    """Response after generating an enclosure."""
    success: bool
    message: str
    job_id: str
    files: dict  # { "base": "/download/abc123/base", "lid": "/download/abc123/lid" }
    dimensions: dict  # { "inner": {...}, "outer": {...} }


class ConnectorListSchema(BaseModel):
    """List of available connector types."""
    connectors: list[dict]
