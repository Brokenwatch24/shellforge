import { useState, useEffect } from "react";
import FileImport from "./components/FileImport";
import ComponentForm from "./components/ComponentForm";
import ComponentsList from "./components/ComponentsList";
import ConnectorForm from "./components/ConnectorForm";
import CustomCutoutForm from "./components/CustomCutoutForm";
import EnclosureConfigPanel from "./components/EnclosureConfig";
import PartsList from "./components/PartsList";
import StylePresets from "./components/StylePresets";
import Viewport3D from "./components/Viewport3D";
import LibrarySearch from "./components/LibrarySearch";
import FootprintConfig from "./components/FootprintConfig";
import { fetchConnectors, generateEnclosure, downloadUrl, download3mfUrl } from "./api";
import "./App.css";

const DEFAULT_CONFIG = {
  padding_x: 3,
  padding_y: 3,
  padding_z: 3,
  wall_thickness: 2.5,
  floor_thickness: 2.5,
  lid_thickness: 2,
  lid_style: "screws",
  fillet_radius: 1.5,
  screw_diameter: 3,
  screw_length: 12,
  lid_hole_style: "countersunk",
  enclosure_style: "classic",
  pcb_standoffs_enabled: true,
};

const DEFAULT_PART = {
  style: "classic",
  fillet_radius: 1.5,
  wall_thickness: 2.5,
  lid_hole_style: "countersunk",
  tray_z: 0,
  tray_thickness: 2,
  bracket_hole_diameter: 4,
  enabled: true,
};

const DEFAULT_PARTS = {
  base:    { ...DEFAULT_PART, enabled: true, edge_style: "fillet", chamfer_size: 1.5 },
  lid:     { ...DEFAULT_PART, enabled: true, edge_style: "fillet", chamfer_size: 1.5 },
  tray:    { ...DEFAULT_PART, enabled: false },
  bracket: { ...DEFAULT_PART, enabled: false },
};

const DEFAULT_FOOTPRINT = {
  shape: "rectangle",
  notch_w: 0,
  notch_d: 0,
  notch_corner: "top_right",
  tab_w: 0,
  tab_d: 0,
  tab_side: "top",
  u_notch_w: 0,
  u_notch_d: 0,
  u_open_side: "top",
  arm_fraction: 0.4,
  polygon_sides: 6,
};

export default function App() {
  const [components, setComponents] = useState([]);
  const [cutouts, setCutouts] = useState([]);
  const [customCutouts, setCustomCutouts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // 'component' | 'cutout' | 'customCutout'
  const [viewMode, setViewMode] = useState("both"); // solid | wireframe | both
  const [transformMode, setTransformMode] = useState("translate");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [parts, setParts] = useState(DEFAULT_PARTS);
  const [selectedPart, setSelectedPart] = useState("base");
  const [activePreset, setActivePreset] = useState(null);
  const [footprint, setFootprint] = useState(DEFAULT_FOOTPRINT);
  const [connectorTypes, setConnectorTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConnectors()
      .then((data) => setConnectorTypes(data.connectors))
      .catch(() => setConnectorTypes([]));
  }, []);

  // ── Part handlers ───────────────────────────────────────────────────────────

  function updatePart(partName, patch) {
    setParts((prev) => ({
      ...prev,
      [partName]: { ...prev[partName], ...patch },
    }));
    setActivePreset(null); // clear preset when user manually edits
  }

  // ── Component handlers ──────────────────────────────────────────────────────

  function addComponent(comp) {
    setComponents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: comp.name,
        width: comp.width,
        depth: comp.depth,
        height: comp.height,
        x: comp.x ?? 0,
        y: comp.y ?? 0,
        ground_z: comp.ground_z ?? comp.z ?? 0,
        rotY: 0,
        visible: true,
        stl_url: comp.stl_url ?? null,
        job_id: comp.job_id ?? null,
        is_pcb: comp.is_pcb ?? false,
        pcb_screw_diameter: comp.pcb_screw_diameter ?? 3.0,
        standoff_positions: comp.standoff_positions ?? [],
      },
    ]);
    setResult(null);
  }

  function updateComponent(id, patch) {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function removeComponent(id) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedType(null);
    }
    setResult(null);
  }

  function toggleVisible(id) {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  }

  // ── Cutout handlers ─────────────────────────────────────────────────────────

  function addCutout(co) {
    setCutouts((prev) => [...prev, { id: crypto.randomUUID(), ...co }]);
  }

  function removeCutout(id) {
    setCutouts((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedType(null);
    }
  }

  // ── Custom cutout handlers ─────────────────────────────────────────────────

  function addCustomCutout(cc) {
    setCustomCutouts((prev) => [...prev, { id: crypto.randomUUID(), ...cc }]);
  }

  function removeCustomCutout(id) {
    setCustomCutouts((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedType(null);
    }
  }

  // ── Cutout position update (from TransformControls gizmo) ──────────────────

  function updateCutout(id, patch) {
    setCutouts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function updateCustomCutout(id, patch) {
    setCustomCutouts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  // ── Selection ───────────────────────────────────────────────────────────────

  function selectComponent(id) {
    setSelectedId(id);
    setSelectedType(id ? "component" : null);
  }

  function selectCutout(id) {
    setSelectedId(id);
    setSelectedType(id ? "cutout" : null);
  }

  function selectCustomCutout(id) {
    setSelectedId(id);
    setSelectedType(id ? "customCutout" : null);
  }

  // ── Import handler ──────────────────────────────────────────────────────────

  function handleImported(data) {
    addComponent({
      name: data.name,
      width: data.width,
      depth: data.depth,
      height: data.height,
      stl_url: data.stl_url,
      job_id: data.job_id,
    });
  }

  // ── Move handler (from TransformControls) ───────────────────────────────────

  function handleComponentMove(id, patch) {
    updateComponent(id, patch);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (components.length === 0) {
      setError("Add at least one component before generating.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Map ground_z back to z for the backend
      const compsForBackend = components.map((c) => ({
        name: c.name,
        width: c.width,
        depth: c.depth,
        height: c.height,
        x: c.x ?? 0,
        y: c.y ?? 0,
        z: c.ground_z ?? 0,
        ground_z: c.ground_z ?? 0,
        is_pcb: c.is_pcb ?? false,
        pcb_screw_diameter: c.pcb_screw_diameter ?? 3.0,
        standoff_positions: c.standoff_positions ?? [],
      }));
      const data = await generateEnclosure({
        ...config,
        components: compsForBackend,
        cutouts,
        custom_cutouts: customCutouts,
        parts,
        footprint,
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <div className="logo">
          <span className="logo-icon">[ ]</span>
          <span className="logo-text">ShellForge</span>
        </div>
        <p className="tagline">Automatic 3D printable enclosure generator for electronics</p>
      </header>

      <main>
        <div className="layout">

          {/* LEFT COLUMN */}
          <div className="left-col">

            {/* 1. Style Presets */}
            <StylePresets
              parts={parts}
              setParts={setParts}
              config={config}
              setConfig={setConfig}
              activePreset={activePreset}
              setActivePreset={setActivePreset}
            />

            {/* 2. File Import */}
            <div className="panel">
              <FileImport onImported={handleImported} />
            </div>

            {/* 2b. Component Library Search */}
            <LibrarySearch onAdd={addComponent} />

            {/* 3. Parts List */}
            <PartsList
              parts={parts}
              updatePart={updatePart}
              selectedPart={selectedPart}
              setSelectedPart={setSelectedPart}
            />

            {/* 4. Components List */}
            <ComponentsList
              components={components}
              cutouts={cutouts}
              customCutouts={customCutouts}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectComponent={selectComponent}
              onSelectCutout={selectCutout}
              onSelectCustomCutout={selectCustomCutout}
              onToggleVisible={toggleVisible}
              onRemoveComponent={removeComponent}
              onRemoveCutout={removeCutout}
              onRemoveCustomCutout={removeCustomCutout}
              onUpdateComponent={updateComponent}
            />

            {/* Connector + Custom Cutout forms */}
            <div className="panel">
              <ComponentForm onAdd={addComponent} />
            </div>

            <div className="panel">
              {connectorTypes.length > 0 ? (
                <ConnectorForm connectors={connectorTypes} onAdd={addCutout} />
              ) : (
                <p className="api-warning">
                  Backend not running. Start with <code>.\start.ps1</code>
                </p>
              )}
            </div>

            <div className="panel">
              <CustomCutoutForm onAdd={addCustomCutout} />
            </div>

            {/* 5. Enclosure Config (padding, screws, etc.) */}
            <div className="panel">
              <EnclosureConfigPanel config={config} onChange={setConfig} />
            </div>

            {/* 5b. Footprint shape */}
            <FootprintConfig footprint={footprint} onChange={setFootprint} />

            {/* 6. Generate button + result */}
            <div className="generate-area">
              <button
                className="generate-btn"
                onClick={handleGenerate}
                disabled={loading || components.length === 0}
              >
                {loading ? "Generating…" : "Generate Enclosure"}
              </button>

              {error && <div className="error-box">{error}</div>}

              {result && (
                <div className="result-box">
                  <h3>Enclosure Ready!</h3>
                  <div className="dimensions">
                    <div className="dim-row">
                      <span>Inner</span>
                      <span>
                        {result.dimensions.inner.width} x{" "}
                        {result.dimensions.inner.depth} x{" "}
                        {result.dimensions.inner.height} mm
                      </span>
                    </div>
                    <div className="dim-row">
                      <span>Outer</span>
                      <span>
                        {result.dimensions.outer.width} x{" "}
                        {result.dimensions.outer.depth} x{" "}
                        {result.dimensions.outer.height} mm
                      </span>
                    </div>
                  </div>
                  <div className="download-links">
                    {result.files.base && (
                      <a
                        href={downloadUrl(result.job_id, "base")}
                        download="enclosure_base.stl"
                        className="download-btn"
                      >
                        Base STL
                      </a>
                    )}
                    {result.files.base_3mf && (
                      <a
                        href={download3mfUrl(result.job_id, "base")}
                        download="enclosure_base.3mf"
                        className="download-btn secondary"
                      >
                        Base 3MF
                      </a>
                    )}
                    {result.files.lid && (
                      <a
                        href={downloadUrl(result.job_id, "lid")}
                        download="enclosure_lid.stl"
                        className="download-btn secondary"
                      >
                        Lid STL
                      </a>
                    )}
                    {result.files.lid_3mf && (
                      <a
                        href={download3mfUrl(result.job_id, "lid")}
                        download="enclosure_lid.3mf"
                        className="download-btn secondary"
                      >
                        Lid 3MF
                      </a>
                    )}
                    {result.files.tray && (
                      <a
                        href={downloadUrl(result.job_id, "tray")}
                        download="enclosure_tray.stl"
                        className="download-btn secondary"
                      >
                        Tray STL
                      </a>
                    )}
                    {result.files.bracket && (
                      <a
                        href={downloadUrl(result.job_id, "bracket")}
                        download="enclosure_bracket.stl"
                        className="download-btn secondary"
                      >
                        Bracket STL
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — 3D Viewport */}
          <div className="right-col">
            <Viewport3D
              components={components}
              cutouts={cutouts}
              customCutouts={customCutouts}
              config={config}
              parts={parts}
              selectedId={selectedId}
              selectedType={selectedType}
              selectedPart={selectedPart}
              onSelectComponent={selectComponent}
              onSelectCutout={selectCutout}
              onSelectCustomCutout={selectCustomCutout}
              onComponentMove={handleComponentMove}
              onCutoutMove={updateCutout}
              onCustomCutoutMove={updateCustomCutout}
              viewMode={viewMode}
              setViewMode={setViewMode}
              transformMode={transformMode}
              setTransformMode={setTransformMode}
              footprint={footprint}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
