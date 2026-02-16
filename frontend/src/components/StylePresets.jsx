/**
 * StylePresets — Quick-apply buttons that set all parts at once to a coordinated look.
 */

const DEFAULTS = {
  fillet_radius: 1.5,
  wall_thickness: 2.5,
  lid_hole_style: "countersunk",
  tray_z: 0,
  tray_thickness: 2,
  bracket_hole_diameter: 4,
  enabled: true,
};

const PRESETS = [
  {
    id: "project-box",
    name: "Project Box",
    icon: "[ ]",
    desc: "Default utility box",
    parts: {
      base: { ...DEFAULTS, style: "classic", fillet_radius: 0 },
      lid:  { ...DEFAULTS, style: "classic", fillet_radius: 0, lid_hole_style: "through" },
      tray: { ...DEFAULTS, style: "classic", enabled: false },
      bracket: { ...DEFAULTS, style: "classic", enabled: false },
    },
    config: { wall_thickness: 2.5, fillet_radius: 0, enclosure_style: "classic", lid_hole_style: "through" },
  },
  {
    id: "consumer",
    name: "Consumer",
    icon: "( )",
    desc: "Clean product look",
    parts: {
      base: { ...DEFAULTS, style: "rounded", fillet_radius: 3.0 },
      lid:  { ...DEFAULTS, style: "rounded", fillet_radius: 3.0, lid_hole_style: "countersunk" },
      tray: { ...DEFAULTS, style: "classic", enabled: false },
      bracket: { ...DEFAULTS, style: "classic", enabled: false },
    },
    config: { wall_thickness: 2.5, fillet_radius: 3.0, enclosure_style: "rounded", lid_hole_style: "countersunk" },
  },
  {
    id: "industrial",
    name: "Industrial",
    icon: "[#]",
    desc: "Rugged build",
    parts: {
      base: { ...DEFAULTS, style: "ribbed", fillet_radius: 0.5, wall_thickness: 4.0 },
      lid:  { ...DEFAULTS, style: "classic", fillet_radius: 0.5, wall_thickness: 3.0, lid_hole_style: "through" },
      tray: { ...DEFAULTS, style: "classic", enabled: false },
      bracket: { ...DEFAULTS, style: "classic", enabled: false },
    },
    config: { wall_thickness: 4.0, fillet_radius: 0.5, enclosure_style: "ribbed", lid_hole_style: "through" },
  },
  {
    id: "ventilated",
    name: "Ventilated",
    icon: "[≡]",
    desc: "Thermal management",
    parts: {
      base: { ...DEFAULTS, style: "vented", fillet_radius: 1.0 },
      lid:  { ...DEFAULTS, style: "vented", fillet_radius: 1.0, lid_hole_style: "countersunk" },
      tray: { ...DEFAULTS, style: "classic", enabled: false },
      bracket: { ...DEFAULTS, style: "classic", enabled: false },
    },
    config: { wall_thickness: 2.5, fillet_radius: 1.0, enclosure_style: "vented", lid_hole_style: "countersunk" },
  },
  {
    id: "minimal",
    name: "Minimal",
    icon: "[_]",
    desc: "Space-saving print",
    parts: {
      base: { ...DEFAULTS, style: "minimal", fillet_radius: 0, wall_thickness: 1.8 },
      lid:  { ...DEFAULTS, style: "minimal", fillet_radius: 0, wall_thickness: 1.8, lid_hole_style: "closed" },
      tray: { ...DEFAULTS, style: "minimal", enabled: false },
      bracket: { ...DEFAULTS, style: "minimal", enabled: false },
    },
    config: { wall_thickness: 1.8, fillet_radius: 0, enclosure_style: "minimal", lid_hole_style: "closed" },
  },
  {
    id: "pro",
    name: "Pro",
    icon: "[*]",
    desc: "Professional finish",
    parts: {
      base: { ...DEFAULTS, style: "ribbed", fillet_radius: 1.5, wall_thickness: 3.0 },
      lid:  { ...DEFAULTS, style: "rounded", fillet_radius: 2.5, wall_thickness: 2.5, lid_hole_style: "countersunk" },
      tray: { ...DEFAULTS, style: "classic", enabled: false },
      bracket: { ...DEFAULTS, style: "classic", enabled: false },
    },
    config: { wall_thickness: 3.0, fillet_radius: 1.5, enclosure_style: "ribbed", lid_hole_style: "countersunk" },
  },
];

export default function StylePresets({ parts, setParts, config, setConfig, activePreset, setActivePreset }) {
  function applyPreset(preset) {
    setParts(preset.parts);
    setConfig((prev) => ({ ...prev, ...preset.config }));
    if (setActivePreset) setActivePreset(preset.id);
  }

  return (
    <div className="style-presets panel">
      <h3>Style Presets</h3>
      <div className="preset-cards-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`preset-card${activePreset === preset.id ? " active" : ""}`}
            onClick={() => applyPreset(preset)}
            title={preset.desc}
          >
            <span className="preset-icon">{preset.icon}</span>
            <span className="preset-name">{preset.name}</span>
            <span className="preset-desc">{preset.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
