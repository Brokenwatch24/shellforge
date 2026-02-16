/**
 * Form to add a new component (with manual dimensions).
 */
export default function ComponentForm({ onAdd }) {
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
      z: parseFloat(fd.get("z") || 0),
    });
    e.target.reset();
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
      <details>
        <summary>Position offset (optional)</summary>
        <div className="field-row three-col">
          <label>X<input name="x" type="number" step="0.1" defaultValue="0" /></label>
          <label>Y<input name="y" type="number" step="0.1" defaultValue="0" /></label>
          <label>Z<input name="z" type="number" step="0.1" defaultValue="0" /></label>
        </div>
      </details>
      <button type="submit">+ Add Component</button>
    </form>
  );
}
