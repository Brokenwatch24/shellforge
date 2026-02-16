"""
ShellForge - Standard connector cutout profiles (width x height in mm).
All measurements include a small tolerance (0.3mm) for printability.
"""

CONNECTOR_PROFILES = {
    "usb_a": {
        "width": 13.0,
        "height": 6.5,
        "label": "USB Type-A"
    },
    "usb_c": {
        "width": 9.3,
        "height": 3.8,
        "label": "USB Type-C"
    },
    "micro_usb": {
        "width": 8.0,
        "height": 3.5,
        "label": "Micro USB"
    },
    "mini_usb": {
        "width": 8.5,
        "height": 4.5,
        "label": "Mini USB"
    },
    "hdmi": {
        "width": 16.0,
        "height": 7.5,
        "label": "HDMI (full)"
    },
    "mini_hdmi": {
        "width": 11.5,
        "height": 5.5,
        "label": "Mini HDMI"
    },
    "jack_3_5": {
        "width": 6.5,
        "height": 6.5,
        "label": "3.5mm Jack (round)",
        "is_round": True,
        "diameter": 6.5
    },
    "barrel_jack": {
        "width": 8.5,
        "height": 8.5,
        "label": "Barrel Jack 5.5mm",
        "is_round": True,
        "diameter": 8.5
    },
    "rj45": {
        "width": 16.5,
        "height": 13.5,
        "label": "RJ45 (Ethernet)"
    },
}


def get_profile(connector_type: str) -> dict:
    """Get the cutout profile for a connector type."""
    profile = CONNECTOR_PROFILES.get(connector_type)
    if not profile:
        raise ValueError(f"Unknown connector type: {connector_type}. Available: {list(CONNECTOR_PROFILES.keys())}")
    return profile


def list_connectors() -> list:
    """List all available connector types with labels."""
    return [
        {"type": key, "label": val["label"]}
        for key, val in CONNECTOR_PROFILES.items()
    ]
