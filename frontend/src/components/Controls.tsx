import React, { useState } from "react";

interface Props {
  onStart: (numDest: number, totalBoxes: number) => void;
  onStep: (n: number) => void;
  onRunFull: () => void;
  onReset: () => void;
  onCompare: () => void;
  isRunning: boolean;
  isDone: boolean;
}

const DEST_OPTIONS = [20, 40, 80];
const BOX_OPTIONS = [200, 500, 1000, 2000];

export default function Controls({
  onStart, onStep, onRunFull, onReset, onCompare, isRunning, isDone,
}: Props) {
  const [numDest, setNumDest] = useState(20);
  const [totalBoxes, setTotalBoxes] = useState(500);
  const [stepSize, setStepSize] = useState(100);

  const btn = (onClick: () => void, label: string, color: string, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "none",
        background: disabled ? "#374151" : color,
        color: disabled ? "#6b7280" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: 13,
        transition: "background 0.2s",
      }}
    >
      {label}
    </button>
  );

  const select = (
    value: number,
    options: number[],
    onChange: (v: number) => void,
    label: string,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#9ca3af" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "#374151", color: "#e5e7eb", border: "1px solid #4b5563",
          borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      style={{
        background: "#1f2937",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "flex-end",
        fontFamily: "sans-serif",
      }}
    >
      {/* Config selectors */}
      {select(numDest, DEST_OPTIONS, setNumDest, "Destinations")}
      {select(totalBoxes, BOX_OPTIONS, setTotalBoxes, "Total boxes")}
      {select(stepSize, [50, 100, 200, 500], setStepSize, "Step size")}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {btn(
          () => onStart(numDest, totalBoxes),
          "⚡ Load CSV & Start",
          "#2563eb",
        )}
        {btn(
          () => onStep(stepSize),
          `+${stepSize} boxes`,
          "#059669",
          !isRunning || isDone,
        )}
        {btn(
          onRunFull,
          "▶ Run Full",
          "#7c3aed",
          !isRunning || isDone,
        )}
        {btn(
          onCompare,
          "📊 Compare",
          "#0891b2",
          !isRunning,
        )}
        {btn(
          onReset,
          "↺ Reset",
          "#dc2626",
        )}
      </div>

      {/* Status badge */}
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280", alignSelf: "center" }}>
        {!isRunning && <span style={{ color: "#6b7280" }}>● Not started</span>}
        {isRunning && !isDone && (
          <span style={{ color: "#f59e0b" }}>● Running — step or run full</span>
        )}
        {isDone && <span style={{ color: "#22c55e" }}>● Done</span>}
      </div>
    </div>
  );
}
