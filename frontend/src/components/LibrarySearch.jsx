/**
 * LibrarySearch - Component library search panel.
 * Searches the backend library and lets users add components directly to the scene.
 */
import { useState, useEffect, useRef } from "react";
import { searchLibrary, fetchCategories } from "../api";

export default function LibrarySearch({ onAdd }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories()
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]));
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, category);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, category, open]);

  // Load all when panel opens
  useEffect(() => {
    if (open) {
      doSearch("", "");
    }
  }, [open]);

  function doSearch(q, cat) {
    setLoading(true);
    searchLibrary(q, cat)
      .then((d) => setResults(d.components || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  function handleAdd(comp) {
    onAdd({
      name: comp.name,
      width: comp.dimensions.width,
      depth: comp.dimensions.depth,
      height: comp.dimensions.height,
      is_pcb: comp.is_pcb,
      pcb_screw_diameter: comp.pcb_screw_diameter,
      x: 0,
      y: 0,
      ground_z: 0,
    });
  }

  return (
    <div className="panel library-panel">
      <div
        className="panel-header"
        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontWeight: 600 }}>Component Library</span>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="library-body" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              className="lib-search-input"
              placeholder="Search components..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, padding: "4px 8px", fontSize: 13 }}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ fontSize: 13, padding: "4px 6px" }}
            >
              <option value="">All</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: 8, opacity: 0.6, fontSize: 12 }}>
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div style={{ textAlign: "center", padding: 8, opacity: 0.5, fontSize: 12 }}>
              No components found
            </div>
          )}

          <div className="library-results" style={{ maxHeight: 260, overflowY: "auto" }}>
            {results.map((comp) => (
              <div
                key={comp.id}
                className="library-item"
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {comp.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1 }}>
                    {comp.dimensions.width} x {comp.dimensions.depth} x {comp.dimensions.height} mm
                  </div>
                  {comp.description && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {comp.description}
                    </div>
                  )}
                </div>
                <button
                  className="toolbar-btn"
                  style={{ flexShrink: 0, padding: "3px 8px", fontSize: 12 }}
                  onClick={() => handleAdd(comp)}
                  title={`Add ${comp.name} to scene`}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
