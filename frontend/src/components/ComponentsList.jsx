/**
 * ComponentsList — shows all components, cutouts, and custom cutouts.
 * Includes PCB standoff hole detection for imported components.
 */
import { useState } from "react";

const PALETTE = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#38bdf8"];
const API_BASE = "http://localhost:8000/api/v1";

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

function DetectHolesPanel({ comp, onApplyStandoffs }) {
  const [loading, setLoading] = useState(false);
  const [holes, setHoles] = useState(null);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState(null);

  if (!comp.stl_url || !comp.job_id) return null;

  async function detect() {
    setLoading(true);
    setError(null);
    setHoles(null);
    try {
      const res = await fetch(`${API_BASE}/detect-holes/${comp.job_id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Detection failed");
      setHoles(data.holes);
      // Select all by default
      const sel = {};
      data.holes.forEach((_, i) => { sel[i] = true; });
      setSelected(sel);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applySelected() {
    const positions = holes
      .filter((_, i) => selected[i])
      .map((h) => ({ x: h.x, y: h.y }));
    onApplyStandoffs(comp.id, positions);
    setHoles(null);
  }

  return (
    <div style={{ padding: "0.5rem", background: "#1a1a2e", borderRadius: "4px", marginTop: "0.25rem" }}>
      <button
        onClick={detect}
        disabled={loading}
        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginBottom: holes ? "0.5rem" : 0 }}
      >
        {loading ? "Detecting..." : "Detect Mounting Holes"}
      </button>
      {error && <p style={{ color: "#f87171", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>{error}</p>}
      {holes !== null && holes.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>No holes detected.</p>
      )}
      {holes && holes.length > 0 && (
        <div>
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0 0 0.25rem" }}>
            {holes.length} hole(s) found:
          </p>
          {holes.map((h, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", marginBottom: "0.2rem" }}>
              <input
                type="checkbox"
                checked={!!selected[i]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [i]: e.target.checked }))}
                style={{ width: "auto" }}
              />
              x={h.x} y={h.y} dia={h.diameter}mm
            </label>
          ))}
          <button
            onClick={applySelected}
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.25rem" }}
          >
            Apply as Standoff Positions
          </button>
        </div>
      )}
    </div>
  );
}

const SHAPE_ICONS = {
  rectangle: "[  ]",
  circle: "( )",
  hexagon: "{ }",
  triangle: "/\\",
};

export default function ComponentsList({
  components,
  cutouts,
  customCutouts,
  selectedId,
  selectedType,
  onSelectComponent,
  onSelectCutout,
  onSelectCustomCutout,
  onToggleVisible,
  onRemoveComponent,
  onRemoveCutout,
  onRemoveCustomCutout,
  onUpdateComponent,
}) {
  const [expandedPcb, setExpandedPcb] = useState(null);

  if (components.length === 0 && cutouts.length === 0 && (!customCutouts || customCutouts.length === 0)) return null;

  return (
    <div className="panel components-list-panel">
      {components.length > 0 && (
        <>
          <h3>Components ({components.length})</h3>
          <div className="comp-list">
            {components.map((comp, i) => {
              const color = PALETTE[i % PALETTE.length];
              const isSelected = selectedId === comp.id && selectedType === "component";
              return (
                <div key={comp.id}>
                  <div
                    className={`comp-item${isSelected ? " selected" : ""}`}
                    style={{ "--item-color": color }}
                    onClick={() => onSelectComponent(comp.id)}
                  >
                    <span className="comp-dot" style={{ background: color }} />
                    <span className="comp-name">
                      {comp.name}
                      {comp.is_pcb && <span style={{ color: "#60a5fa", marginLeft: "4px", fontSize: "0.7rem" }}>PCB</span>}
                      {(comp.ground_z > 0) && <span style={{ color: "#f59e0b", marginLeft: "4px", fontSize: "0.7rem" }}>Z+{comp.ground_z}</span>}
                    </span>
                    <span className="comp-dims">
                      {comp.width}×{comp.depth}×{comp.height}
                    </span>
                    {comp.is_pcb && comp.stl_url && (
                      <button
                        className="icon-btn"
                        onClick={(e) => { e.stopPropagation(); setExpandedPcb(expandedPcb === comp.id ? null : comp.id); }}
                        title="Detect mounting holes"
                        style={{ fontSize: "0.65rem", padding: "1px 4px" }}
                      >
                        #
                      </button>
                    )}
                    <button
                      className={`icon-btn eye-btn${comp.visible ? "" : " muted"}`}
                      onClick={(e) => { e.stopPropagation(); onToggleVisible(comp.id); }}
                      title={comp.visible ? "Hide" : "Show"}
                    >
                      <EyeIcon visible={comp.visible} />
                    </button>
                    <button
                      className="icon-btn trash-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveComponent(comp.id); }}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {expandedPcb === comp.id && (
                    <DetectHolesPanel
                      comp={comp}
                      onApplyStandoffs={(id, positions) => {
                        onUpdateComponent(id, { standoff_positions: positions });
                        setExpandedPcb(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {cutouts.length > 0 && (
        <>
          <h3 style={{ marginTop: components.length > 0 ? "1rem" : 0 }}>
            Connector Cutouts ({cutouts.length})
          </h3>
          <div className="comp-list">
            {cutouts.map((co) => {
              const color = "#94a3b8";
              const isSelected = selectedId === co.id && selectedType === "cutout";
              return (
                <div
                  key={co.id}
                  className={`comp-item${isSelected ? " selected" : ""}`}
                  style={{ "--item-color": color }}
                  onClick={() => onSelectCutout(co.id)}
                >
                  <span className="comp-dot" style={{ background: color }} />
                  <span className="comp-name">{co.connector_type}</span>
                  <span className="comp-dims">{co.face} wall</span>
                  <button
                    className="icon-btn trash-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveCutout(co.id); }}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {customCutouts && customCutouts.length > 0 && (
        <>
          <h3 style={{ marginTop: (components.length > 0 || cutouts.length > 0) ? "1rem" : 0 }}>
            Custom Cutouts ({customCutouts.length})
          </h3>
          <div className="comp-list">
            {customCutouts.map((cc) => {
              const color = "#f59e0b";
              const isSelected = selectedId === cc.id && selectedType === "customCutout";
              return (
                <div
                  key={cc.id}
                  className={`comp-item${isSelected ? " selected" : ""}`}
                  style={{ "--item-color": color }}
                  onClick={() => onSelectCustomCutout && onSelectCustomCutout(cc.id)}
                >
                  <span className="comp-dot" style={{ background: color }} />
                  <span className="comp-name">
                    {SHAPE_ICONS[cc.shape] || cc.shape} {cc.shape}
                  </span>
                  <span className="comp-dims">{cc.face} | {cc.width}×{cc.height}mm</span>
                  <button
                    className="icon-btn trash-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveCustomCutout && onRemoveCustomCutout(cc.id); }}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
