import { useState, useEffect } from "react";
import ComponentForm from "./components/ComponentForm";
import ConnectorForm from "./components/ConnectorForm";
import EnclosureConfigPanel from "./components/EnclosureConfig";
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
  }

  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
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
          <span className="logo-icon">[]</span>
          <span className="logo-text">ShellForge</span>
        </div>
        <p className="tagline">Automatic 3D enclosure generator for electronics</p>
      </header>

      <main>
        <div className="panel">
          <ComponentForm onAdd={addComponent} />

          {components.length > 0 && (
            <div className="list">
              <h4>Components ({components.length})</h4>
              {components.map((c, i) => (
                <div key={i} className="list-item">
                  <span>{c.name} — {c.width} x {c.depth} x {c.height} mm</span>
                  <button onClick={() => removeComponent(i)} className="remove-btn">x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          {connectorTypes.length > 0 && (
            <ConnectorForm connectors={connectorTypes} onAdd={addCutout} />
          )}

          {cutouts.length > 0 && (
            <div className="list">
              <h4>Connector Cutouts ({cutouts.length})</h4>
              {cutouts.map((c, i) => (
                <div key={i} className="list-item">
                  <span>{c.connector_type} — {c.face} wall</span>
                  <button onClick={() => removeCutout(i)} className="remove-btn">x</button>
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
                <p>Inner: {result.dimensions.inner.width} x {result.dimensions.inner.depth} x {result.dimensions.inner.height} mm</p>
                <p>Outer: {result.dimensions.outer.width} x {result.dimensions.outer.depth} x {result.dimensions.outer.height} mm</p>
              </div>
              <div className="download-links">
                {result.files.base && (
                  <a href={downloadUrl(result.job_id, "base")} download="enclosure_base.stl" className="download-btn">
                    Download Base STL
                  </a>
                )}
                {result.files.lid && (
                  <a href={downloadUrl(result.job_id, "lid")} download="enclosure_lid.stl" className="download-btn">
                    Download Lid STL
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
