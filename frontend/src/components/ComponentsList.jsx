/**
 * ComponentsList — shows all components and cutouts with selection, visibility, delete.
 */

const PALETTE = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#38bdf8"];

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

export default function ComponentsList({
  components,
  cutouts,
  selectedId,
  selectedType,
  onSelectComponent,
  onSelectCutout,
  onToggleVisible,
  onRemoveComponent,
  onRemoveCutout,
}) {
  if (components.length === 0 && cutouts.length === 0) return null;

  return (
    <div className="panel components-list-panel">
      {components.length > 0 && (
        <>
          <h3>Components ({components.length})</h3>
          <div className="comp-list">
            {components.map((comp, i) => {
              const color = PALETTE[i % PALETTE.length];
              const isSelected = selectedId === comp.id && selectedType === "component";
              return (
                <div
                  key={comp.id}
                  className={`comp-item${isSelected ? " selected" : ""}`}
                  style={{ "--item-color": color }}
                  onClick={() => onSelectComponent(comp.id)}
                >
                  <span className="comp-dot" style={{ background: color }} />
                  <span className="comp-name">{comp.name}</span>
                  <span className="comp-dims">
                    {comp.width}×{comp.depth}×{comp.height}
                  </span>
                  <button
                    className={`icon-btn eye-btn${comp.visible ? "" : " muted"}`}
                    onClick={(e) => { e.stopPropagation(); onToggleVisible(comp.id); }}
                    title={comp.visible ? "Hide" : "Show"}
                  >
                    <EyeIcon visible={comp.visible} />
                  </button>
                  <button
                    className="icon-btn trash-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveComponent(comp.id); }}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {cutouts.length > 0 && (
        <>
          <h3 style={{ marginTop: components.length > 0 ? "1rem" : 0 }}>
            Cutouts ({cutouts.length})
          </h3>
          <div className="comp-list">
            {cutouts.map((co, i) => {
              const color = "#94a3b8";
              const isSelected = selectedId === co.id && selectedType === "cutout";
              return (
                <div
                  key={co.id}
                  className={`comp-item${isSelected ? " selected" : ""}`}
                  style={{ "--item-color": color }}
                  onClick={() => onSelectCutout(co.id)}
                >
                  <span className="comp-dot" style={{ background: color }} />
                  <span className="comp-name">{co.connector_type}</span>
                  <span className="comp-dims">{co.face} wall</span>
                  <button
                    className="icon-btn trash-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveCutout(co.id); }}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
