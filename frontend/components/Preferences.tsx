"use client";

export type Preferences = { animate: boolean; scale: number; detailed?: boolean };

export default function PreferencesControls({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  return (
    <div className="preferences-controls">
      <label className="settings-row">
        <span>
          Animate the illustration<small>Visible spacecraft motion in the cinematic hero</small>
        </span>
        <input
          type="checkbox"
          checked={value.animate}
          onChange={(e) => onChange({ ...value, animate: e.target.checked })}
        />
      </label>
      <label className="settings-row size-setting">
        <span>
          Interface size <output>{Math.round(value.scale * 100)}%</output>
        </span>
        <input
          aria-label="Interface size"
          type="range"
          min="0.95"
          max="1.08"
          step="0.01"
          value={value.scale}
          onChange={(e) =>
            onChange({ ...value, scale: Number(e.target.value) })
          }
        />
      </label>
      <label className="settings-row"><span>Detailed scientific controls<small>Show additional sampling, geometry and evidence controls</small></span><input type="checkbox" checked={value.detailed??true} onChange={e=>onChange({...value,detailed:e.target.checked})}/></label>
      <p className="muted">
        Preferences stay in this browser. The illustration also respects your system’s
        reduced-motion setting. Scientific units and calculations are unchanged.
      </p>
    </div>
  );
}
