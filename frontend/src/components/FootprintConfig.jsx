/**
 * FootprintConfig - Enclosure shape selector panel.
 * Lets users pick rectangle, L-shape, T-shape, U-shape, plus, hexagon, octagon.
 */

const SHAPES = [
  { id: "rectangle", label: "Rect", icon: "□" },
  { id: "l_shape",   label: "L",    icon: "⌐" },
  { id: "t_shape",   label: "T",    icon: "T" },
  { id: "u_shape",   label: "U",    icon: "U" },
  { id: "plus",      label: "+",    icon: "+" },
  { id: "hexagon",   label: "Hex",  icon: "⬡" },
  { id: "octagon",   label: "Oct",  icon: "Oct" },
];

export default function FootprintConfig({ footprint, onChange }) {
  const shape = footprint.shape || "rectangle";

  function set(field, value) {
    onChange({ ...footprint, [field]: value });
  }

  function setNum(field) {
    return (e) => set(field, parseFloat(e.target.value) || 0);
  }

  return (
    <div className="panel footprint-panel">
      <h3>Enclosure Shape</h3>

      {/* Shape selector grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            className={`toolbar-btn${shape === s.id ? " active" : ""}`}
            style={{ flex: "1 0 calc(14% - 6px)", minWidth: 44, padding: "5px 4px", fontSize: 13, textAlign: "center" }}
            onClick={() => set("shape", s.id)}
            title={s.label}
          >
            <div style={{ fontSize: 16, lineHeight: 1 }}>{s.icon}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* L-shape options */}
      {shape === "l_shape" && (
        <div className="expanded-fields">
          <div className="field-row two-col">
            <label>
              Notch W (mm)
              <input type="number" step="1" min="0" value={footprint.notch_w || 0} onChange={setNum("notch_w")} placeholder="auto" />
            </label>
            <label>
              Notch D (mm)
              <input type="number" step="1" min="0" value={footprint.notch_d || 0} onChange={setNum("notch_d")} placeholder="auto" />
            </label>
          </div>
          <div className="field-row">
            <label>
              Corner
              <select value={footprint.notch_corner || "top_right"} onChange={(e) => set("notch_corner", e.target.value)}>
                <option value="top_right">Top Right</option>
                <option value="top_left">Top Left</option>
                <option value="bottom_right">Bottom Right</option>
                <option value="bottom_left">Bottom Left</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* T-shape options */}
      {shape === "t_shape" && (
        <div className="expanded-fields">
          <div className="field-row two-col">
            <label>
              Tab W (mm)
              <input type="number" step="1" min="0" value={footprint.tab_w || 0} onChange={setNum("tab_w")} placeholder="auto" />
            </label>
            <label>
              Tab D (mm)
              <input type="number" step="1" min="0" value={footprint.tab_d || 0} onChange={setNum("tab_d")} placeholder="auto" />
            </label>
          </div>
          <div className="field-row">
            <label>
              Tab Side
              <select value={footprint.tab_side || "top"} onChange={(e) => set("tab_side", e.target.value)}>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* U-shape options */}
      {shape === "u_shape" && (
        <div className="expanded-fields">
          <div className="field-row two-col">
            <label>
              Notch W (mm)
              <input type="number" step="1" min="0" value={footprint.u_notch_w || 0} onChange={setNum("u_notch_w")} placeholder="auto" />
            </label>
            <label>
              Notch D (mm)
              <input type="number" step="1" min="0" value={footprint.u_notch_d || 0} onChange={setNum("u_notch_d")} placeholder="auto" />
            </label>
          </div>
          <div className="field-row">
            <label>
              Open Side
              <select value={footprint.u_open_side || "top"} onChange={(e) => set("u_open_side", e.target.value)}>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Plus options */}
      {shape === "plus" && (
        <div className="expanded-fields">
          <div className="field-row">
            <label>
              Arm Width Fraction
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={footprint.arm_fraction || 0.4}
                onChange={(e) => set("arm_fraction", parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
              <span style={{ fontSize: 12, opacity: 0.7 }}>{((footprint.arm_fraction || 0.4) * 100).toFixed(0)}%</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
