"""
ShellForge - Data models for components and enclosure configuration.
"""
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class ConnectorType(str, Enum):
    USB_A = "usb_a"
    USB_C = "usb_c"
    MICRO_USB = "micro_usb"
    MINI_USB = "mini_usb"
    HDMI = "hdmi"
    MINI_HDMI = "mini_hdmi"
    JACK_3_5 = "jack_3_5"
    BARREL_JACK = "barrel_jack"
    RJ45 = "rj45"
    CUSTOM = "custom"


class WallFace(str, Enum):
    FRONT = "front"   # +Y
    BACK = "back"     # -Y
    LEFT = "left"     # -X
    RIGHT = "right"   # +X
    TOP = "top"       # +Z
    BOTTOM = "bottom" # -Z


class LidStyle(str, Enum):
    SNAP = "snap"
    SCREWS = "screws"
    NONE = "none"


@dataclass
class Vector3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


@dataclass
class Component:
    """Represents a 3D component placed in the enclosure space."""
    name: str
    file_path: str                     # Path to STEP or STL file
    position: Vector3 = field(default_factory=Vector3)
    rotation: Vector3 = field(default_factory=Vector3)  # Euler angles in degrees

    # Bounding box (computed after loading the model)
    bbox_min: Optional[Vector3] = None
    bbox_max: Optional[Vector3] = None

    @property
    def size(self) -> Optional[Vector3]:
        if self.bbox_min and self.bbox_max:
            return Vector3(
                self.bbox_max.x - self.bbox_min.x,
                self.bbox_max.y - self.bbox_min.y,
                self.bbox_max.z - self.bbox_min.z,
            )
        return None


@dataclass
class ConnectorCutout:
    """A connector hole to cut into one of the enclosure walls."""
    connector_type: ConnectorType
    face: WallFace
    offset_x: float = 0.0    # mm from center of the face
    offset_y: float = 0.0    # mm from center of the face
    rotation: float = 0.0    # degrees, in case the connector is rotated
    custom_width: Optional[float] = None   # for CUSTOM type
    custom_height: Optional[float] = None  # for CUSTOM type


@dataclass
class EnclosureConfig:
    """Configuration for generating the enclosure."""
    # Padding around components (mm)
    padding_x: float = 3.0
    padding_y: float = 3.0
    padding_z: float = 3.0

    # Wall thickness (mm)
    wall_thickness: float = 2.5
    floor_thickness: float = 2.5
    lid_thickness: float = 2.5

    # Lid style
    lid_style: LidStyle = LidStyle.SCREWS

    # Screw boss settings (for SCREWS lid style)
    screw_diameter: float = 3.0     # M3 by default
    boss_diameter: float = 7.0
    boss_height: float = 5.0

    # Snap fit settings (for SNAP lid style)
    snap_depth: float = 1.5
    snap_width: float = 8.0

    # Fillet radius (rounded edges), 0 = sharp
    fillet_radius: float = 1.5

    # Components and cutouts
    components: list = field(default_factory=list)
    cutouts: list = field(default_factory=list)
