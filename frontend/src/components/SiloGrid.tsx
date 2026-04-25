import React, { useEffect, useRef } from "react";
import { AisleState } from "../api/siloApi";

// ── colour palette (up to 80 destinations) ───────────────────────────────────
const COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f59e0b","#10b981",
  "#6366f1","#84cc16","#0ea5e9","#d946ef","#fb923c",
  "#a3e635","#34d399","#60a5fa","#c084fc","#fb7185",
  "#dc2626","#ea580c","#ca8a04","#16a34a","#2563eb",
  "#7c3aed","#db2777","#0d9488","#d97706","#059669",
  "#4f46e5","#65a30d","#0284c7","#c026d3","#b45309",
  "#15803d","#1d4ed8","#7e22ce","#be185d","#0f766e",
  "#b91c1c","#c2410c","#a16207","#15803d","#1e40af",
  "#6d28d9","#9d174d","#0e7490","#92400e","#064e3b",
  "#1e3a8a","#3730a3","#701a75","#831843","#164e63",
  "#78350f","#14532d","#172554","#0c4a6e","#1a2e05",
  "#fde68a","#bbf7d0","#bfdbfe","#e9d5ff","#fecaca",
  "#fed7aa","#fef08a","#d1fae5","#dbeafe","#f3e8ff",
  "#fce7f3","#cffafe","#fef9c3","#dcfce7","#ede9fe",
  "#fee2e2","#ffedd5","#fefce8","#f0fdf4","#eff6ff",
];

function destColor(idx: number | null): string {
  if (idx === null) return "#374151"; // occupied, unknown dest
  return COLORS[idx % COLORS.length];
}

interface Props {
  state: AisleState | null;
  selectedAisle: string;
  onAisleChange: (a: string) => void;
  useSmart: boolean;
}

const AISLES = ["10", "20", "30", "40"];
const AISLE_LABELS: Record<string, string> = {
  "10": "Aisle 1", "20": "Aisle 2", "30": "Aisle 3", "40": "Aisle 4",
};

const CELL_W = 14; // px per X column
const CELL_H = 32; // px per Y row
const MARGIN_LEFT = 36;
const MARGIN_TOP = 4;

export default function SiloGrid({ state, selectedAisle, onAisleChange, useSmart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 60 * CELL_W + MARGIN_LEFT + 4;
    const H = 8 * CELL_H + MARGIN_TOP + 20;
    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, H);

    // Y axis labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px monospace";
    for (let y = 1; y <= 8; y++) {
      const yPx = MARGIN_TOP + (8 - y) * CELL_H + CELL_H / 2 - 5;
      ctx.fillText(`Y${y}`, 2, yPx + 10);
    }

    // Cells
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 60; x++) {
        const xPx = MARGIN_LEFT + (x - 1) * CELL_W;
        const yPx = MARGIN_TOP + (8 - y) * CELL_H;

        for (const side of ["10", "20"]) {
          for (const z of [1, 2]) {
            const pos = `${selectedAisle}${side}${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}${String(z).padStart(2, "0")}`;
            const cell = state.cells[pos];

            const halfH = CELL_H / 2 - 1;
            const sideOffset = side === "10" ? 0 : CELL_W / 2;
            const zOffset = z === 1 ? 0 : halfH + 1;
            const cw = CELL_W / 2 - 1;
            const ch = halfH;

            let color = "#1f2937"; // empty
            if (cell?.code) {
              color = cell.dest_idx !== null ? destColor(cell.dest_idx) : "#6b7280";
            }

            ctx.fillStyle = color;
            ctx.fillRect(xPx + sideOffset, yPx + zOffset, cw, ch);
          }
        }

        // X label every 10
        if (x % 10 === 0) {
          ctx.fillStyle = "#4b5563";
          ctx.font = "9px monospace";
          ctx.fillText(String(x), xPx + 1, MARGIN_TOP + 8 * CELL_H + 14);
        }
      }
    }

    // Shuttle positions (one per Y)
    const shuttles = state.shuttles;
    for (let y = 1; y <= 8; y++) {
      const sk = `${selectedAisle}_${y}`;
      const sx = shuttles[sk] ?? 0;
      const xPx = MARGIN_LEFT + sx * CELL_W;
      const yPx = MARGIN_TOP + (8 - y) * CELL_H;
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xPx, yPx, CELL_W, CELL_H - 1);
    }
  }, [state, selectedAisle]);

  // Build legend from current state
  const legend: Array<{ label: string; color: string }> = [];
  if (state) {
    const seen = new Set<number>();
    for (const cell of Object.values(state.cells)) {
      if (cell.dest_idx !== null && !seen.has(cell.dest_idx)) {
        seen.add(cell.dest_idx);
        legend.push({ label: `Dest ${cell.dest_idx + 1}`, color: destColor(cell.dest_idx) });
        if (legend.length >= 12) break;
      }
    }
  }

  return (
    <div style={{ fontFamily: "monospace", color: "#e5e7eb" }}>
      {/* Aisle selector */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>Aisle:</span>
        {AISLES.map((a) => (
          <button
            key={a}
            onClick={() => onAisleChange(a)}
            style={{
              padding: "3px 12px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              background: a === selectedAisle ? "#3b82f6" : "#374151",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          >
            {AISLE_LABELS[a]}
          </button>
        ))}
        <span style={{ marginLeft: 16, color: "#6b7280", fontSize: 12 }}>
          {useSmart ? "🧠 Smart" : "📋 Naive"} &nbsp;|&nbsp;
          <span style={{ color: "#facc15" }}>■</span> shuttle
          &nbsp;|&nbsp;<span style={{ color: "#1f2937", background: "#1f2937", padding: "0 6px" }}>□</span> empty
        </span>
      </div>

      {/* Canvas grid */}
      <div style={{ overflowX: "auto", background: "#111827", borderRadius: 8, padding: 8 }}>
        {state ? (
          <canvas ref={canvasRef} style={{ display: "block" }} />
        ) : (
          <div style={{ padding: 40, color: "#6b7280", textAlign: "center" }}>
            Load the CSV to see the silo state
          </div>
        )}
      </div>

      {/* Mini legend */}
      {legend.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {legend.map(({ label, color }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, background: color, display: "inline-block", borderRadius: 2 }} />
              {label}
            </span>
          ))}
          {state && Object.values(state.cells).filter((c) => c.dest_idx === null && c.code).length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, background: "#6b7280", display: "inline-block", borderRadius: 2 }} />
              Legacy
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      {state && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
          Aisle {AISLE_LABELS[selectedAisle]} &nbsp;•&nbsp;
          60 × 8 × 2 sides × 2 depths = 1 920 cells &nbsp;•&nbsp;
          Yellow border = shuttle current position
        </div>
      )}
    </div>
  );
}
