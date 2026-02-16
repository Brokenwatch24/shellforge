/**
 * Enclosure configuration panel (padding, walls, lid style, etc.)
 */
export default function EnclosureConfig({ config, onChange }) {
  function handle(field) {
    return (e) => onChange({ ...config, [field]: parseFloat(e.target.value) || e.target.value });
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
        <label>Wall Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.wall_thickness} onChange={handle("wall_thickness")} /></label>
        <label>Floor Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.floor_thickness} onChange={handle("floor_thickness")} /></label>
        <label>Lid Thickness (mm)<input type="number" step="0.5" min="1" max="10" value={config.lid_thickness} onChange={handle("lid_thickness")} /></label>
      </div>

      <div className="field-row two-col">
        <label>
          Lid Style
          <select value={config.lid_style} onChange={handle("lid_style")}>
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
    </div>
  );
}
