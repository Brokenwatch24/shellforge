/**
 * Enclosure configuration panel (padding, walls, lid style, styles, etc.)
 */

const STYLE_DESCRIPTIONS = {
  classic: "Plain rectangular box — default.",
  vented: "Ventilation slots on side walls (2mm slots every 8mm).",
  rounded: "Aggressive corner rounding (3mm fillet on all edges).",
  ribbed: "Horizontal structural ribs on outside of walls.",
  minimal: "Thin walls (1.8mm), no fillets, no bosses — minimalist design.",
};

export default function EnclosureConfig({ config, onChange }) {
  function handle(field) {
    return (e) => onChange({ ...config, [field]: parseFloat(e.target.value) || e.target.value });
  }
  function handleStr(field) {
    return (e) => onChange({ ...config, [field]: e.target.value });
  }
  function handleBool(field) {
    return (e) => onChange({ ...config, [field]: e.target.checked });
  }

  return (
    <div className="enclosure-config">
      <h3>Enclosure Settings</h3>

      {/* Enclosure Style */}
      <div className="field-row">
        <label>
          Enclosure Style
          <select value={config.enclosure_style || "classic"} onChange={handleStr("enclosure_style")}>
            <option value="classic">Classic</option>
            <option value="vented">Vented</option>
            <option value="rounded">Rounded</option>
            <option value="ribbed">Ribbed</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
        <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
          {STYLE_DESCRIPTIONS[config.enclosure_style || "classic"]}
        </p>
      </div>

      <div className="field-row three-col">
        <label>Padding X (mm)<input type="number" step="0.5" min="0" value={config.padding_x} onChange={handle("padding_x")} /></label>
        <label>Padding Y (mm)<input type="number" step="0.5" min="0" value={config.padding_y} onChange={handle("padding_y")} /></label>
        <label>Padding Z (mm)<input type="number" step="0.5" min="0" value={config.padding_z} onChange={handle("padding_z")} /></label>
      </div>

      <div className="field-row three-col">
        <label>Wall Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.wall_thickness} onChange={handle("wall_thickness")} /></label>
        <label>Floor Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.floor_thickness} onChange={handle("floor_thickness")} /></label>
        <label>Lid Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.lid_thickness} onChange={handle("lid_thickness")} /></label>
      </div>

      <div className="field-row two-col">
        <label>
          Lid Style
          <select value={config.lid_style} onChange={handleStr("lid_style")}>
            <option value="screws">Screws (M3)</option>
            <option value="snap">Snap Fit</option>
            <option value="none">No Lid</option>
          </select>
        </label>
        <label>
          Fillet Radius (mm)
          <input type="number" step="0.5" min="0" max="5" value={config.fillet_radius} onChange={handle("fillet_radius")} />
        </label>
      </div>

      {config.lid_style === "screws" && (
        <div className="field-row two-col">
          <label>
            Screw Length (mm)
            <input type="number" step="1" min="4" max="30" value={config.screw_length || 12} onChange={handle("screw_length")} />
          </label>
          <label>
            Lid Holes
            <select value={config.lid_hole_style || "countersunk"} onChange={handleStr("lid_hole_style")}>
              <option value="through">Through (open)</option>
              <option value="countersunk">Countersunk</option>
              <option value="closed">Closed (no hole)</option>
            </select>
          </label>
        </div>
      )}

      <div className="field-row" style={{ marginTop: "0.5rem" }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={config.pcb_standoffs_enabled !== false}
            onChange={handleBool("pcb_standoffs_enabled")}
            style={{ width: "auto" }}
          />
          Auto-generate PCB standoffs (for PCB components)
        </label>
      </div>
    </div>
  );
}
