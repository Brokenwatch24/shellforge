import { useState, useEffect } from "react";
import FileImport from "./components/FileImport";
import ComponentForm from "./components/ComponentForm";
import ComponentsList from "./components/ComponentsList";
import ConnectorForm from "./components/ConnectorForm";
import EnclosureConfigPanel from "./components/EnclosureConfig";
import Viewport3D from "./components/Viewport3D";
import { fetchConnectors, generateEnclosure, downloadUrl } from "./api";
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
};

export default function App() {
  const [components, setComponents] = useState([]);
  const [cutouts, setCutouts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // 'component' | 'cutout'
  const [viewMode, setViewMode] = useState("both"); // solid | wireframe | both
  const [transformMode, setTransformMode] = useState("translate");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [connectorTypes, setConnectorTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConnectors()
      .then((data) => setConnectorTypes(data.connectors))
      .catch(() => setConnectorTypes([]));
  }, []);

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

  // ── Selection ───────────────────────────────────────────────────────────────

  function selectComponent(id) {
    setSelectedId(id);
    setSelectedType(id ? "component" : null);
  }

  function selectCutout(id) {
    setSelectedId(id);
    setSelectedType(id ? "cutout" : null);
  }

  // ── Import handler ──────────────────────────────────────────────────────────

  function handleImported(data) {
    addComponent({
      name: data.name,
      width: data.width,
      depth: data.depth,
      height: data.height,
      stl_url: data.stl_url,
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
        ...c,
        z: c.ground_z ?? 0,
      }));
      const data = await generateEnclosure({
        ...config,
        components: compsForBackend,
        cutouts,
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

            <div className="panel">
              <FileImport onImported={handleImported} />
            </div>

            <div className="panel">
              <ComponentForm onAdd={addComponent} />
            </div>

            <ComponentsList
              components={components}
              cutouts={cutouts}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectComponent={selectComponent}
              onSelectCutout={selectCutout}
              onToggleVisible={toggleVisible}
              onRemoveComponent={removeComponent}
              onRemoveCutout={removeCutout}
            />

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
              <EnclosureConfigPanel config={config} onChange={setConfig} />
            </div>

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
                        {result.dimensions.inner.width} ×{" "}
                        {result.dimensions.inner.depth} ×{" "}
                        {result.dimensions.inner.height} mm
                      </span>
                    </div>
                    <div className="dim-row">
                      <span>Outer</span>
                      <span>
                        {result.dimensions.outer.width} ×{" "}
                        {result.dimensions.outer.depth} ×{" "}
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
                        ↓ Base STL
                      </a>
                    )}
                    {result.files.lid && (
                      <a
                        href={downloadUrl(result.job_id, "lid")}
                        download="enclosure_lid.stl"
                        className="download-btn secondary"
                      >
                        ↓ Lid STL
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
              config={config}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectComponent={selectComponent}
              onSelectCutout={selectCutout}
              onComponentMove={handleComponentMove}
              viewMode={viewMode}
              setViewMode={setViewMode}
              transformMode={transformMode}
              setTransformMode={setTransformMode}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
