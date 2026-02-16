import { useState, useEffect } from "react";
import ComponentForm from "./components/ComponentForm";
import ConnectorForm from "./components/ConnectorForm";
import EnclosureConfigPanel from "./components/EnclosureConfig";
import EnclosureViewer from "./components/EnclosureViewer";
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

  function addComponent(comp) {
    setComponents((prev) => [...prev, comp]);
    setResult(null);
  }

  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
    setResult(null);
  }

  function addCutout(co) {
    setCutouts((prev) => [...prev, co]);
  }

  function removeCutout(i) {
    setCutouts((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleGenerate() {
    if (components.length === 0) {
      setError("Add at least one component before generating.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await generateEnclosure({ ...config, components, cutouts });
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

          {/* LEFT COLUMN — inputs */}
          <div className="left-col">

            <div className="panel">
              <ComponentForm onAdd={addComponent} />
              {components.length > 0 && (
                <div className="list">
                  <h4>Components ({components.length})</h4>
                  {components.map((c, i) => (
                    <div key={i} className="list-item">
                      <span className="list-name">{c.name}</span>
                      <span className="list-dims">{c.width} × {c.depth} × {c.height} mm</span>
                      <button onClick={() => removeComponent(i)} className="remove-btn">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              {connectorTypes.length > 0 ? (
                <ConnectorForm connectors={connectorTypes} onAdd={addCutout} />
              ) : (
                <p className="api-warning">Backend not running. Start with <code>.\start.ps1</code></p>
              )}
              {cutouts.length > 0 && (
                <div className="list">
                  <h4>Connector Cutouts ({cutouts.length})</h4>
                  {cutouts.map((c, i) => (
                    <div key={i} className="list-item">
                      <span className="list-name">{c.connector_type}</span>
                      <span className="list-dims">{c.face} wall</span>
                      <button onClick={() => removeCutout(i)} className="remove-btn">✕</button>
                    </div>
                  ))}
                </div>
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
                {loading ? "Generating..." : "Generate Enclosure"}
              </button>

              {error && <div className="error-box">{error}</div>}

              {result && (
                <div className="result-box">
                  <h3>Enclosure Ready!</h3>
                  <div className="dimensions">
                    <div className="dim-row">
                      <span>Inner</span>
                      <span>{result.dimensions.inner.width} × {result.dimensions.inner.depth} × {result.dimensions.inner.height} mm</span>
                    </div>
                    <div className="dim-row">
                      <span>Outer</span>
                      <span>{result.dimensions.outer.width} × {result.dimensions.outer.depth} × {result.dimensions.outer.height} mm</span>
                    </div>
                  </div>
                  <div className="download-links">
                    {result.files.base && (
                      <a href={downloadUrl(result.job_id, "base")} download="enclosure_base.stl" className="download-btn">
                        ↓ Base STL
                      </a>
                    )}
                    {result.files.lid && (
                      <a href={downloadUrl(result.job_id, "lid")} download="enclosure_lid.stl" className="download-btn secondary">
                        ↓ Lid STL
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN — 3D viewer */}
          <div className="right-col">
            <EnclosureViewer components={components} config={config} />
          </div>

        </div>
      </main>
    </div>
  );
}
