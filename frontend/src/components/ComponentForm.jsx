/**
 * Form to add a new component (with manual dimensions).
 */
import { useState } from "react";

export default function ComponentForm({ onAdd }) {
  const [isPcb, setIsPcb] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    onAdd({
      name: fd.get("name") || "Component",
      width: parseFloat(fd.get("width")),
      depth: parseFloat(fd.get("depth")),
      height: parseFloat(fd.get("height")),
      x: parseFloat(fd.get("x") || 0),
      y: parseFloat(fd.get("y") || 0),
      ground_z: parseFloat(fd.get("ground_z") || 0),
      is_pcb: isPcb,
      pcb_screw_diameter: parseFloat(fd.get("pcb_screw_diameter") || 3.0),
    });
    e.target.reset();
    setIsPcb(false);
  }

  return (
    <form onSubmit={handleSubmit} className="component-form">
      <h3>Add Component</h3>
      <div className="field-row">
        <label>Name<input name="name" placeholder="ESP32 Dev Board" /></label>
      </div>
      <div className="field-row three-col">
        <label>Width (mm)<input name="width" type="number" step="0.1" min="1" required placeholder="28" /></label>
        <label>Depth (mm)<input name="depth" type="number" step="0.1" min="1" required placeholder="55" /></label>
        <label>Height (mm)<input name="height" type="number" step="0.1" min="1" required placeholder="12" /></label>
      </div>

      <div className="field-row">
        <label>
          Ground Z (mm) — Vertical offset / height off floor
          <input name="ground_z" type="number" step="0.1" min="0" defaultValue="0" />
        </label>
      </div>

      <details>
        <summary>Position offset X / Y (optional)</summary>
        <div className="field-row two-col">
          <label>X offset<input name="x" type="number" step="0.1" defaultValue="0" /></label>
          <label>Y offset<input name="y" type="number" step="0.1" defaultValue="0" /></label>
        </div>
      </details>

      <div className="field-row" style={{ marginTop: "0.5rem" }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={isPcb}
            onChange={(e) => setIsPcb(e.target.checked)}
            style={{ width: "auto" }}
          />
          PCB Component (generates standoffs)
        </label>
      </div>

      {isPcb && (
        <div className="field-row" style={{ paddingLeft: "1rem", borderLeft: "2px solid #4ade80" }}>
          <label>
            Screw Diameter (mm)
            <input name="pcb_screw_diameter" type="number" step="0.1" min="1" max="6" defaultValue="3.0" />
          </label>
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
            Standoff positions auto-detected or set manually via Detect Holes.
          </p>
        </div>
      )}

      <button type="submit">+ Add Component</button>
    </form>
  );
}
