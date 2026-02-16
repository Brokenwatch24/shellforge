/**
 * FileImport — Drag & drop or click to import STL / STEP files.
 * On success calls onImported({ name, width, depth, height, stl_url })
 */
import { useState, useRef } from "react";
import { importModel } from "../api";

export default function FileImport({ onImported }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["stl", "step", "stp"].includes(ext)) {
      setError("Only .stl, .step, .stp files supported");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await importModel(file);
      onImported(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onInputChange(e) {
    handleFile(e.target.files[0]);
    e.target.value = "";
  }

  return (
    <div className="file-import-panel">
      <h3>Import 3D Model</h3>
      <div
        className={`drop-zone${dragging ? " dragging" : ""}${loading ? " loading" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !loading && inputRef.current?.click()}
      >
        {loading ? (
          <span className="drop-hint">Processing…</span>
        ) : (
          <>
            <span className="drop-icon">⬆</span>
            <span className="drop-hint">Drop STL / STEP here or click</span>
            <span className="drop-sub">.stl · .step · .stp</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".stl,.step,.stp"
        style={{ display: "none" }}
        onChange={onInputChange}
      />
      {error && <div className="import-error">{error}</div>}
    </div>
  );
}
