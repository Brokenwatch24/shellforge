"""
ShellForge - Quick test: generate an enclosure from manual bounding boxes.
No 3D model files needed — just component dimensions.

Run: python tests/test_bbox_generator.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.engine.models import EnclosureConfig, LidStyle
from backend.engine.bbox_only import generate_from_manual_bbox

def main():
    print("ShellForge Engine Test")
    print("=" * 40)

    # Simulate an ESP32 dev board + small OLED screen
    components = [
        {
            "name": "ESP32 Dev Board",
            "width": 28.0,
            "depth": 55.0,
            "height": 12.0,
            "x": 0,
            "y": 0,
            "z": 0,
        },
        {
            "name": "OLED 0.96 inch",
            "width": 27.0,
            "depth": 27.0,
            "height": 4.0,
            "x": 0,
            "y": -14,   # positioned in front of ESP32
            "z": 0,
        },
    ]

    config = EnclosureConfig(
        padding_x=4.0,
        padding_y=4.0,
        padding_z=5.0,
        wall_thickness=2.5,
        floor_thickness=2.5,
        lid_thickness=2.0,
        lid_style=LidStyle.SCREWS,
        fillet_radius=1.5,
    )

    result = generate_from_manual_bbox(
        components_bbox=components,
        config=config,
        output_dir="./output/test"
    )

    print("\nOutput files:")
    for part, path in result.items():
        size_kb = os.path.getsize(path) / 1024
        print(f"   {part}: {path} ({size_kb:.1f} KB)")

    print("\nTest PASSED! Open the STL files in your slicer to preview.")


def test_wrapper():
    """Test wrapper engine with an L-shaped component arrangement."""
    print("\nShellForge Wrapper Engine Test")
    print("=" * 40)

    from backend.engine.wrapper import generate_wrapper_enclosure
    from backend.engine.models import EnclosureConfig, LidStyle

    # L-shaped arrangement: two components making an L
    components = [
        {
            "name": "PCB Main",
            "width": 60,
            "depth": 40,
            "height": 15,
            "x": 0,
            "y": 0,
            "ground_z": 0,
        },
        {
            "name": "PCB Side",
            "width": 30,
            "depth": 20,
            "height": 10,
            "x": 45,
            "y": 30,
            "ground_z": 0,
        },
    ]
    config = EnclosureConfig(
        padding_x=3,
        padding_y=3,
        padding_z=3,
        lid_style=LidStyle.SCREWS,
    )
    result = generate_wrapper_enclosure(components, config, "./output/test_wrapper")
    assert "base" in result, "Expected 'base' in result"
    assert os.path.exists(result["base"]), f"Base STL not found: {result['base']}"
    size_kb = os.path.getsize(result["base"]) / 1024
    print(f"\nOutput files:")
    for part, path in result.items():
        part_size_kb = os.path.getsize(path) / 1024
        print(f"   {part}: {path} ({part_size_kb:.1f} KB)")
    print(f"\nWrapper test PASSED! L-shaped enclosure: {size_kb:.1f} KB base STL")


if __name__ == "__main__":
    main()
    test_wrapper()
