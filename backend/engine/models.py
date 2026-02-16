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


class CustomCutoutShape(str, Enum):
    RECTANGLE = "rectangle"
    CIRCLE = "circle"
    HEXAGON = "hexagon"
    TRIANGLE = "triangle"


class FootprintShape(str, Enum):
    RECTANGLE = "rectangle"
    L_SHAPE = "l_shape"
    T_SHAPE = "t_shape"
    U_SHAPE = "u_shape"
    PLUS = "plus"
    HEXAGON = "hexagon"
    OCTAGON = "octagon"


@dataclass
class Vector3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


@dataclass
class FootprintConfig:
    shape: str = "rectangle"
    # For L_SHAPE: notch in one corner
    notch_w: float = 0.0      # if 0: auto = outer_w * 0.4
    notch_d: float = 0.0      # if 0: auto = outer_d * 0.4
    notch_corner: str = "top_right"  # top_right/top_left/bottom_right/bottom_left
    # For T_SHAPE: tab on one side
    tab_w: float = 0.0        # width of tab
    tab_d: float = 0.0        # depth of tab
    tab_side: str = "top"     # top/bottom/left/right
    # For U_SHAPE: notch from one side
    u_notch_w: float = 0.0
    u_notch_d: float = 0.0
    u_open_side: str = "top"  # which side is open
    # For PLUS: arm width fraction
    arm_fraction: float = 0.4
    # Polygon sides (for hexagon/octagon fallback)
    polygon_sides: int = 6


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

    # PCB / height fields
    is_pcb: bool = False
    pcb_screw_diameter: float = 3.0
    ground_z: float = 0.0
    standoff_positions: list = field(default_factory=list)  # [{x, y}] component-local coords

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
class CustomCutout:
    """A custom-shaped hole to cut into one of the enclosure walls."""
    shape: CustomCutoutShape
    face: WallFace
    width: float          # mm
    height: float         # mm (= diameter for circle)
    depth: float          # how deep to cut (0 = auto: wall_thickness + 2)
    offset_x: float = 0.0
    offset_y: float = 0.0
    rotation: float = 0.0  # degrees


@dataclass
class PartConfig:
    """Per-part style/settings override."""
    style: str = "classic"              # classic/vented/rounded/ribbed/minimal
    fillet_radius: float = 1.5
    wall_thickness: float = 2.5
    # Part-specific extras:
    lid_hole_style: str = "countersunk" # only for Lid part
    tray_z: float = 0.0                 # only for Tray part - height off floor
    tray_thickness: float = 2.0         # Tray floor thickness
    bracket_hole_diameter: float = 4.0  # for Mount Bracket
    enabled: bool = True                # whether to generate this part
    # Edge style
    edge_style: str = "fillet"          # "none" | "fillet" | "chamfer"
    chamfer_size: float = 1.5           # mm


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

    # Screw length determines boss height
    screw_length: float = 12.0
    lid_hole_style: str = "countersunk"  # "through" | "countersunk" | "closed"

    # Snap fit settings (for SNAP lid style)
    snap_depth: float = 1.5
    snap_width: float = 8.0

    # Fillet radius (rounded edges), 0 = sharp
    fillet_radius: float = 1.5

    # Enclosure style
    enclosure_style: str = "classic"  # "classic" | "vented" | "rounded" | "ribbed" | "minimal"

    # PCB standoffs
    pcb_standoffs_enabled: bool = True

    # Footprint shape
    footprint: FootprintConfig = field(default_factory=FootprintConfig)

    # Per-part configs
    parts: dict = field(default_factory=lambda: {
        "base": PartConfig(),
        "lid": PartConfig(),
        "tray": PartConfig(enabled=False),
        "bracket": PartConfig(enabled=False),
    })

    # Components and cutouts
    components: list = field(default_factory=list)
    cutouts: list = field(default_factory=list)
    custom_cutouts: list = field(default_factory=list)
