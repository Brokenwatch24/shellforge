/**
 * Form to add a connector cutout to a wall.
 */
const FACES = ["front", "back", "left", "right", "top", "bottom"];

export default function ConnectorForm({ connectors, onAdd }) {
  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    onAdd({
      connector_type: fd.get("connector_type"),
      face: fd.get("face"),
      offset_x: parseFloat(fd.get("offset_x") || 0),
      offset_y: parseFloat(fd.get("offset_y") || 0),
    });
    e.target.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="connector-form">
      <h3>Add Connector Cutout</h3>
      <div className="field-row two-col">
        <label>
          Connector Type
          <select name="connector_type" required>
            {connectors.map((c) => (
              <option key={c.type} value={c.type}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          Wall Face
          <select name="face" required>
            {FACES.map((f) => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Position on face (optional)</summary>
        <div className="field-row two-col">
          <label>Offset X (mm)<input name="offset_x" type="number" step="0.5" defaultValue="0" /></label>
          <label>Offset Y (mm)<input name="offset_y" type="number" step="0.5" defaultValue="0" /></label>
        </div>
      </details>
      <button type="submit">+ Add Cutout</button>
    </form>
  );
}
