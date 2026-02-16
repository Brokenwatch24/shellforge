# ShellForge

> Automatic 3D printable enclosure generator for electronics projects.

Place your components, configure connector cutouts, get a print-ready enclosure in seconds.

![ShellForge UI](docs/screenshot.png)

---

## Features

- Add components by dimensions (width × depth × height)
- Live 3D preview of your layout and enclosure
- Connector cutouts: USB-C, USB-A, HDMI, Jack 3.5mm, Barrel Jack, RJ45, and more
- Configurable padding, wall thickness, lid style (screws / snap fit)
- Exports base + lid as separate STL files ready for your slicer

## Requirements

- Python 3.10+
- Node.js 18+

## Installation

```bash
git clone https://github.com/Brokenwatch24/shellforge.git
cd shellforge

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Running

**Windows:**
```powershell
.\start.ps1
```

**Mac / Linux:**
```bash
# Terminal 1 — Backend
python -m uvicorn backend.api.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Then open **http://localhost:5173** in your browser.

- API docs: http://localhost:8000/docs

## How to use

1. **Add components** — Enter the name and dimensions (mm) of each component in your project
2. **Position them** — Use the X/Y offset fields to place components relative to each other
3. **Add connector cutouts** — Select the connector type and which wall to cut it into
4. **Configure the enclosure** — Adjust padding, wall thickness, lid style
5. **Generate** — Click "Generate Enclosure" and download your STL files
6. **Print** — Open the STLs in your slicer (Cura, PrusaSlicer, Bambu Studio, etc.)

## Supported Connectors

| Type | Label |
|------|-------|
| `usb_a` | USB Type-A |
| `usb_c` | USB Type-C |
| `micro_usb` | Micro USB |
| `mini_usb` | Mini USB |
| `hdmi` | HDMI (full size) |
| `mini_hdmi` | Mini HDMI |
| `jack_3_5` | 3.5mm Jack |
| `barrel_jack` | Barrel Jack 5.5mm |
| `rj45` | RJ45 (Ethernet) |

## Project Structure

```
shellforge/
├── backend/
│   ├── engine/
│   │   ├── generator.py     # CadQuery enclosure generator (STEP/STL input)
│   │   ├── bbox_only.py     # Generator from manual dimensions
│   │   └── models.py        # Data models
│   ├── api/
│   │   ├── main.py          # FastAPI app
│   │   ├── routes.py        # API endpoints
│   │   └── schemas.py       # Request/Response models
│   └── connectors/
│       └── profiles.py      # Connector cutout profiles
├── frontend/
│   └── src/
│       ├── App.jsx           # Main app
│       ├── api.js            # API client
│       └── components/
│           ├── ComponentForm.jsx
│           ├── ConnectorForm.jsx
│           ├── EnclosureConfig.jsx
│           └── EnclosureViewer.jsx  # 3D preview (Three.js)
├── tests/
│   └── test_bbox_generator.py
├── requirements.txt
└── start.ps1
```

## Roadmap

- [x] Core CadQuery engine
- [x] Manual bounding box mode
- [x] Connector cutout library
- [x] FastAPI REST backend
- [x] React frontend with live 3D preview
- [ ] STEP/STL model import (bring your actual component models)
- [ ] Export to 3MF
- [ ] Community component library

## License

MIT — do whatever you want with it.

Built with [CadQuery](https://cadquery.readthedocs.io/), [FastAPI](https://fastapi.tiangolo.com/), [React](https://react.dev/), and [Three.js](https://threejs.org/).
