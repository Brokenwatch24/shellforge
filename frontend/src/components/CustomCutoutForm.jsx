/**
 * Form to add a custom cutout (rectangle, circle, hexagon, triangle) to a wall.
 */

const FACE_OPTIONS = ["front", "back", "left", "right"];
const SHAPE_OPTIONS = ["rectangle", "circle", "hexagon", "triangle"];

export default function CustomCutoutForm({ onAdd }) {
  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const shape = fd.get("shape");
    const depthVal = parseFloat(fd.get("depth") || 0);
    onAdd({
      shape,
      face: fd.get("face"),
      width: parseFloat(fd.get("width")),
      height: shape === "circle" ? parseFloat(fd.get("width")) : parseFloat(fd.get("height") || fd.get("width")),
      depth: depthVal,
      offset_x: parseFloat(fd.get("offset_x") || 0),
      offset_y: parseFloat(fd.get("offset_y") || 0),
      rotation: parseFloat(fd.get("rotation") || 0),
    });
    e.target.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="component-form">
      <h3>Add Custom Cutout</h3>

      <div className="field-row two-col">
        <label>
          Shape
          <select name="shape" defaultValue="rectangle">
            {SHAPE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Wall Face
          <select name="face" defaultValue="front">
            {FACE_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row two-col">
        <label>
          Width (mm)
          <input name="width" type="number" step="0.5" min="1" required placeholder="20" />
        </label>
        <label>
          Height (mm) <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>(ignored for circle)</span>
          <input name="height" type="number" step="0.5" min="1" placeholder="10" />
        </label>
      </div>

      <div className="field-row two-col">
        <label>
          Offset X (mm)
          <input name="offset_x" type="number" step="0.5" defaultValue="0" />
        </label>
        <label>
          Offset Y (mm)
          <input name="offset_y" type="number" step="0.5" defaultValue="0" />
        </label>
      </div>

      <div className="field-row two-col">
        <label>
          Depth (mm) <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>(0 = auto)</span>
          <input name="depth" type="number" step="0.5" min="0" defaultValue="0" />
        </label>
        <label>
          Rotation (deg)
          <input name="rotation" type="number" step="5" defaultValue="0" />
        </label>
      </div>

      <button type="submit">+ Add Custom Cutout</button>
    </form>
  );
}
