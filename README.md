# ShellForge

> Automatic 3D printable enclosure generator for electronics projects.

Place your components, define connector cutouts, get a ready-to-print enclosure. No CAD skills needed.

---

## What it does

You provide:
- 3D models of your components (STEP or STL), or just their dimensions
- Where to put them inside the box
- Which connector holes you need (USB-C, HDMI, jack, etc.)

ShellForge gives you:
- A two-part enclosure (base + lid) ready for your 3D printer
- Correct wall thickness, screw bosses, and tolerances
- STL and 3MF export

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the test (generates a sample ESP32 + OLED enclosure)
python tests/test_bbox_generator.py

# Output: output/test/enclosure_base.stl + enclosure_lid.stl
```

## Project Structure

```
shellforge/
├── backend/
│   ├── engine/
│   │   ├── generator.py     # Core CadQuery enclosure generator
│   │   ├── bbox_only.py     # Generator from manual dimensions
│   │   └── models.py        # Data models and config
│   └── connectors/
│       └── profiles.py      # Standard connector cutout profiles
├── tests/
│   └── test_bbox_generator.py
├── frontend/                # Web UI (coming soon)
└── output/                  # Generated STL files
```

## Supported Connectors

| Type | Label |
|------|-------|
| `usb_a` | USB Type-A |
| `usb_c` | USB Type-C |
| `micro_usb` | Micro USB |
| `hdmi` | HDMI (full) |
| `mini_hdmi` | Mini HDMI |
| `jack_3_5` | 3.5mm Jack |
| `barrel_jack` | Barrel Jack 5.5mm |
| `rj45` | RJ45 (Ethernet) |

## Roadmap

- [x] Core enclosure engine (CadQuery)
- [x] Manual bounding box mode
- [x] Connector cutout library
- [ ] STEP/STL model import
- [ ] FastAPI REST API
- [ ] Web UI (React + Three.js)
- [ ] Component 3D viewer
- [ ] Docker deployment

## License

MIT — do whatever you want with it.

---

*Built with [CadQuery](https://cadquery.readthedocs.io/) — parametric CAD with Python.*
