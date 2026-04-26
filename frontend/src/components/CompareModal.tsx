import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartEntry, Improvement } from "../api/siloApi";

const ALGO_COLORS = { naive: "#ef4444", smart: "#f59e0b", optimal: "#22c55e" };
const TIP_ORDER: Array<"optimal" | "smart" | "naive"> = ["optimal", "smart", "naive"];

function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean; payload?: readonly any[]; label?: string; unit: string;
}) {
  if (!active || !payload?.length) return null;
  const byKey: Record<string, any> = {};
  payload.forEach((p: any) => { byKey[p.dataKey] = p; });
  return (
    <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 6,
                  padding: "10px 14px", fontSize: 14, lineHeight: "24px" }}>
      <div style={{ color: "#e5e7eb", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {TIP_ORDER.map((key) => {
        const p = byKey[key];
        if (!p) return null;
        return (
          <div key={key} style={{ color: p.fill }}>
            {p.name} : {p.value} {unit}
          </div>
        );
      })}
    </div>
  );
}

function ImprovementBadge({ label, pct, lowerIsBetter = false }: {
  label: string; pct: number; lowerIsBetter?: boolean;
}) {
  const positive = pct > 0;
  const color = (lowerIsBetter ? positive : positive) ? "#22c55e" : "#ef4444";
  const arrow = positive ? "▲" : "▼";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
      <div style={{ color: "#9ca3af", fontSize: 17 }}>{label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 34, fontFamily: "monospace" }}>
        {arrow} {Math.abs(pct)}%
      </div>
    </div>
  );
}

interface Props {
  chartData: ChartEntry[];
  impSmartVsNaive:   Improvement | null;
  impOptimalVsSmart: Improvement | null;
  onClose: () => void;
}

export default function CompareModal({ chartData, impSmartVsNaive: isn, impOptimalVsSmart: ios, onClose }: Props) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#0d1117",
      display: "flex", flexDirection: "column",
      padding: "24px 32px", overflowY: "auto",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb" }}>Algorithm Comparison</div>
          <div style={{ fontSize: 15, color: "#6b7280", marginTop: 2 }}>
            Naive &nbsp;·&nbsp; Smart &nbsp;·&nbsp; Optimal
          </div>
        </div>
        <button onClick={onClose} style={{
          marginLeft: "auto", background: "#1f2937", border: "1px solid #374151",
          color: "#9ca3af", borderRadius: 8, padding: "6px 16px",
          cursor: "pointer", fontSize: 15,
        }}>
          ✕ Close
        </button>
      </div>

      {/* 4 charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
        {chartData.map((entry) => {
          const vals = [entry.naive, entry.smart, entry.optimal].filter(v => v > 0);
          const minVal = Math.min(...vals);
          const maxVal = Math.max(...vals);
          const pad = (maxVal - minVal) * 0.3 || maxVal * 0.15;
          const yMin = Math.max(0, Math.floor(minVal - pad));
          const yMax = Math.ceil(maxVal + pad);
          const lowerIsBetter = entry.metric.toLowerCase().includes("time");
          const hint = lowerIsBetter
            ? { label: "↓ lower is better", color: "#60a5fa" }
            : { label: "↑ higher is better", color: "#34d399" };
          return (
            <div key={entry.metric} style={{ background: "#1f2937", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 600, color: "#d1d5db" }}>
                  {entry.metric}
                  <span style={{ color: "#6b7280", fontWeight: 400, marginLeft: 8, fontSize: 16 }}>{entry.unit}</span>
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: hint.color,
                               background: hint.color + "18", borderRadius: 4, padding: "3px 12px" }}>
                  {hint.label}
                </span>
              </div>

              {/* value callouts */}
              <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
                {(["optimal", "smart", "naive"] as const).map((algo) => (
                  <div key={algo}>
                    <div style={{ color: ALGO_COLORS[algo], fontSize: 30, fontWeight: 700, fontFamily: "monospace" }}>
                      {entry[algo]}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>{algo}</div>
                  </div>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[entry]} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis hide />
                  <YAxis domain={[yMin, yMax]} tick={{ fill: "#9ca3af", fontSize: 13 }} width={48} />
                  <Tooltip content={(props) => (
                    <ChartTooltip {...props} label={entry.metric} unit={entry.unit} />
                  )} />
                  <Bar dataKey="optimal" name="Optimal" fill={ALGO_COLORS.optimal} radius={[4,4,0,0]} />
                  <Bar dataKey="smart"   name="Smart"   fill={ALGO_COLORS.smart}   radius={[4,4,0,0]} />
                  <Bar dataKey="naive"   name="Naive"   fill={ALGO_COLORS.naive}   radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>

      {/* improvement panels */}
      {(isn || ios) && (
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          {isn && (
            <div style={{ background: "#1f2937", borderRadius: 12, padding: "14px 24px", flex: 1 }}>
              <div style={{ fontSize: 20, marginBottom: 12 }}>
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>Smart</span>
                <span style={{ color: "#9ca3af" }}> vs </span>
                <span style={{ color: "#ef4444", fontWeight: 600 }}>Naive</span>
                <span style={{ color: "#9ca3af" }}> improvement</span>
              </div>
              <div style={{ display: "flex", gap: 28 }}>
                <ImprovementBadge label="Throughput"     pct={isn.throughput_per_hour} />
                <ImprovementBadge label="Avg Time"       pct={isn.avg_time_per_pallet} lowerIsBetter />
                <ImprovementBadge label="Full Pallets %" pct={isn.full_pallets_pct} />
              </div>
            </div>
          )}
          {ios && (
            <div style={{ background: "#1f2937", borderRadius: 12, padding: "14px 24px", flex: 1,
                          border: "1px solid #22c55e44" }}>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
                <span style={{ color: "#22c55e" }}>✦ Optimal</span>
                <span style={{ color: "#9ca3af" }}> vs </span>
                <span style={{ color: "#f59e0b" }}>Smart</span>
                <span style={{ color: "#9ca3af" }}> improvement</span>
              </div>
              <div style={{ display: "flex", gap: 28 }}>
                <ImprovementBadge label="Throughput"     pct={ios.throughput_per_hour} />
                <ImprovementBadge label="Avg Time"       pct={ios.avg_time_per_pallet} lowerIsBetter />
                <ImprovementBadge label="Full Pallets %" pct={ios.full_pallets_pct} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
