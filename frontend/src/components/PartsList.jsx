/**
 * PartsList — Per-part configuration panel.
 * Shows Base, Lid, Tray, Bracket. Each can be enabled/disabled,
 * has a style dropdown, and when selected shows expanded settings.
 */

const PART_ICONS = {
  base: "□",
  lid: "⊓",
  tray: "─",
  bracket: "⌐",
};

const PART_LABELS = {
  base: "Base",
  lid: "Lid",
  tray: "Tray",
  bracket: "Bracket",
};

const PART_DESCRIPTIONS = {
  base: "Bottom shell",
  lid: "Top cover",
  tray: "Inner PCB shelf",
  bracket: "Wall-mount bracket",
};

const STYLES = ["classic", "vented", "rounded", "ribbed", "minimal"];

const PART_ORDER = ["base", "lid", "tray", "bracket"];

export default function PartsList({ parts, updatePart, selectedPart, setSelectedPart }) {
  if (!parts) return null;

  return (
    <div className="parts-list panel">
      <h3>Enclosure Parts</h3>
      <div className="parts-rows">
        {PART_ORDER.map((partName) => {
          const part = parts[partName];
          const isSelected = selectedPart === partName;
          const isEnabled = part.enabled !== false;

          return (
            <div key={partName}>
              <div
                className={`part-row${isSelected ? " selected" : ""}${!isEnabled ? " disabled" : ""}`}
                onClick={() => setSelectedPart(partName)}
              >
                {/* Toggle */}
                <input
                  type="checkbox"
                  className="part-toggle"
                  checked={isEnabled}
                  disabled={partName === "base"}
                  onChange={(e) => {
                    e.stopPropagation();
                    updatePart(partName, { enabled: e.target.checked });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title={partName === "base" ? "Base is always required" : `Enable ${PART_LABELS[partName]}`}
                />

                {/* Icon + name */}
                <span className="part-icon">{PART_ICONS[partName]}</span>
                <span className="part-label">{PART_LABELS[partName]}</span>
                <span className="part-desc">{PART_DESCRIPTIONS[partName]}</span>

                {/* Style dropdown (only when enabled) */}
                {isEnabled ? (
                  <select
                    className="part-style-select"
                    value={part.style || "classic"}
                    onChange={(e) => {
                      e.stopPropagation();
                      updatePart(partName, { style: e.target.value });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="part-disabled-label">disabled</span>
                )}
              </div>

              {/* Expanded settings when selected */}
              {isSelected && isEnabled && (
                <div className="part-expanded">
                  <PartExpandedSettings
                    partName={partName}
                    part={part}
                    updatePart={updatePart}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartExpandedSettings({ partName, part, updatePart }) {
  function handle(field) {
    return (e) => updatePart(partName, { [field]: parseFloat(e.target.value) || e.target.value });
  }
  function handleStr(field) {
    return (e) => updatePart(partName, { [field]: e.target.value });
  }

  if (partName === "base") {
    return (
      <div className="expanded-fields">
        <div className="field-row two-col">
          <label>
            Wall Thickness (mm)
            <input type="number" step="0.5" min="1" max="10" value={part.wall_thickness} onChange={handle("wall_thickness")} />
          </label>
          <label>
            Fillet Radius (mm)
            <input type="number" step="0.5" min="0" max="5" value={part.fillet_radius} onChange={handle("fillet_radius")} />
          </label>
        </div>
      </div>
    );
  }

  if (partName === "lid") {
    return (
      <div className="expanded-fields">
        <div className="field-row two-col">
          <label>
            Wall Thickness (mm)
            <input type="number" step="0.5" min="1" max="10" value={part.wall_thickness} onChange={handle("wall_thickness")} />
          </label>
          <label>
            Fillet Radius (mm)
            <input type="number" step="0.5" min="0" max="5" value={part.fillet_radius} onChange={handle("fillet_radius")} />
          </label>
        </div>
        <div className="field-row">
          <label>
            Lid Hole Style
            <select value={part.lid_hole_style || "countersunk"} onChange={handleStr("lid_hole_style")}>
              <option value="through">Through (open)</option>
              <option value="countersunk">Countersunk</option>
              <option value="closed">Closed (no hole)</option>
            </select>
          </label>
        </div>
      </div>
    );
  }

  if (partName === "tray") {
    return (
      <div className="expanded-fields">
        <div className="field-row two-col">
          <label>
            Tray Height (mm)
            <input type="number" step="1" min="0" max="200" value={part.tray_z} onChange={handle("tray_z")} />
          </label>
          <label>
            Tray Thickness (mm)
            <input type="number" step="0.5" min="1" max="10" value={part.tray_thickness} onChange={handle("tray_thickness")} />
          </label>
        </div>
        <p className="expanded-hint">Inner shelf at specified height from floor, 2mm clearance from walls.</p>
      </div>
    );
  }

  if (partName === "bracket") {
    return (
      <div className="expanded-fields">
        <div className="field-row">
          <label>
            Hole Diameter (mm)
            <input type="number" step="0.5" min="2" max="12" value={part.bracket_hole_diameter} onChange={handle("bracket_hole_diameter")} />
          </label>
        </div>
        <p className="expanded-hint">L-bracket (30mm wide) with 2 mounting holes for wall or DIN rail mount.</p>
      </div>
    );
  }

  return null;
}
