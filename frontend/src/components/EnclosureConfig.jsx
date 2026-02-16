/**
 * Enclosure configuration panel (padding, walls, lid style, screws, standoffs).
 * Style and lid_hole_style have been moved to PartsList per-part settings.
 */

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

      <div className="field-row three-col">
        <label>Padding X (mm)<input type="number" step="0.5" min="0" value={config.padding_x} onChange={handle("padding_x")} /></label>
        <label>Padding Y (mm)<input type="number" step="0.5" min="0" value={config.padding_y} onChange={handle("padding_y")} /></label>
        <label>Padding Z (mm)<input type="number" step="0.5" min="0" value={config.padding_z} onChange={handle("padding_z")} /></label>
      </div>

      <div className="field-row three-col">
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
          Screw Diameter (mm)
          <input type="number" step="0.5" min="2" max="5" value={config.screw_diameter} onChange={handle("screw_diameter")} />
        </label>
      </div>

      {config.lid_style === "screws" && (
        <div className="field-row">
          <label>
            Screw Length (mm)
            <input type="number" step="1" min="4" max="30" value={config.screw_length || 12} onChange={handle("screw_length")} />
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

      <p style={{ fontSize: "0.72rem", color: "#555", marginTop: "0.6rem" }}>
        Style, wall thickness, and fillet settings are now in the Parts panel above.
      </p>
    </div>
  );
}
