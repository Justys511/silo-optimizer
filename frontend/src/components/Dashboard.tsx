import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Metrics, ChartEntry, Improvement } from "../api/siloApi";

// ── algo colour palette ───────────────────────────────────────────────────────
const ALGO_COLORS = {
  naive:   "#ef4444",   // red
  smart:   "#f59e0b",   // amber
  optimal: "#22c55e",   // green
};

interface Props {
  smartMetrics:   Metrics | null;
  naiveMetrics:   Metrics | null;
  optimalMetrics: Metrics | null;
  chartData:      ChartEntry[];
  impSmartVsNaive?:   Improvement | null;
  impOptimalVsSmart?: Improvement | null;
}

// ── sub-components ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function MetricCard({ label, values, sub }: {
  label: string;
  values: Array<{ algo: "naive" | "smart" | "optimal"; val: string | number }>;
  sub?: string;
}) {
  return (
    <div style={{ background: "#1f2937", borderRadius: 10, padding: "12px 16px", flex: 1, minWidth: 160 }}>
      <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {values.map(({ algo, val }) => (
          <div key={algo}>
            <div style={{ color: ALGO_COLORS[algo], fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
              {val}
            </div>
            <div style={{ color: "#6b7280", fontSize: 10 }}>{algo}</div>
          </div>
        ))}
      </div>
      {sub && <div style={{ color: "#6b7280", fontSize: 10, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ImprovementBadge({ label, pct, lowerIsBetter = false }: {
  label: string; pct: number; lowerIsBetter?: boolean;
}) {
  const positive = lowerIsBetter ? pct > 0 : pct > 0;
  const color = positive ? "#22c55e" : "#ef4444";
  const arrow = positive ? "▲" : "▼";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ color: "#9ca3af", fontSize: 10 }}>{label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 15, fontFamily: "monospace" }}>
        {arrow} {Math.abs(pct)}%
      </div>
    </div>
  );
}

function PalletBar({ dest, count, target }: { dest: string; count: number; target: number }) {
  const pct = Math.min((count / target) * 100, 100);
  const color = pct >= 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#3b82f6";
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>
        <span style={{ fontFamily: "monospace" }}>…{dest.slice(-6)}</span>
        <span>{count} / {target}</span>
      </div>
      <div style={{ background: "#374151", borderRadius: 3, height: 6 }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Dashboard({
  smartMetrics: s, naiveMetrics: n, optimalMetrics: o,
  chartData, impSmartVsNaive: isn, impOptimalVsSmart: ios,
}: Props) {
  const any = s || n || o;

  const mv = (algo: "naive" | "smart" | "optimal", m: Metrics | null, key: keyof Metrics) =>
    m ? { algo, val: m[key] as string | number } : null;

  const row = (
    label: string,
    key: keyof Metrics,
    fmt: (v: number) => string | number = (v) => v,
    sub?: string,
  ) => {
    const vals = [
      mv("naive", n, key),
      mv("smart", s, key),
      mv("optimal", o, key),
    ].filter(Boolean) as Array<{ algo: "naive" | "smart" | "optimal"; val: string | number }>;
    const fmtVals = vals.map(({ algo, val }) => ({ algo, val: typeof val === "number" ? fmt(val) : val }));
    return <MetricCard key={label} label={label} values={fmtVals} sub={sub} />;
  };

  return (
    <div style={{ fontFamily: "sans-serif", color: "#e5e7eb" }}>

      {/* ── Algorithm badges ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Badge label="Naive (FIFO)" color={ALGO_COLORS.naive} />
        <Badge label="Smart (greedy)"  color={ALGO_COLORS.smart} />
        <Badge label="Optimal (Hungarian + Hot/Cold + EMA)" color={ALGO_COLORS.optimal} />
      </div>

      {/* ── Metric cards ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {row("Completed Pallets",   "completed_pallets")}
        {row("Full Pallets %",      "full_pallets_pct",    (v) => `${v}%`)}
        {row("Throughput (p/hr)",   "throughput_per_hour", (v) => v)}
        {row("Avg Time/Pallet (s)", "avg_time_per_pallet", (v) => Math.round(v))}
        {row("Boxes Placed",        "boxes_placed",        (v) => v, "smart engine")}
        {row("Silo Occupancy",      "occupied_cells",      (v) =>
          s ? `${Math.round((v / s.total_cells) * 100)}%` : "—")}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

        {/* ── Active pallets (smart) ── */}
        <div style={{ background: "#1f2937", borderRadius: 10, padding: 14, minWidth: 220, flex: "0 0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#d1d5db" }}>
            Active Pallets — Smart
          </div>
          {!s || s.active_pallets.length === 0
            ? <div style={{ color: "#6b7280", fontSize: 12 }}>No active pallets</div>
            : s.active_pallets.map((p) => (
                <PalletBar key={p.destination} dest={p.destination} count={p.count} target={p.target} />
              ))}
        </div>

        {/* ── Comparison chart ── */}
        <div style={{ background: "#1f2937", borderRadius: 10, padding: 14, flex: 1, minWidth: 340 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#d1d5db" }}>
            Naive vs Smart vs Optimal
          </div>
          {chartData.length === 0
            ? <div style={{ color: "#6b7280", fontSize: 12, paddingTop: 16 }}>
                Click Compare to populate this chart
              </div>
            : <ResponsiveContainer width="100%" height={210}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6 }}
                    labelStyle={{ color: "#e5e7eb" }}
                    formatter={(val: any, name: any) => [`${val}`, String(name)]}
                  />
                  <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 11 }} />
                  <Bar dataKey="naive"   name="Naive"   fill={ALGO_COLORS.naive}   radius={[3,3,0,0]} />
                  <Bar dataKey="smart"   name="Smart"   fill={ALGO_COLORS.smart}   radius={[3,3,0,0]} />
                  <Bar dataKey="optimal" name="Optimal" fill={ALGO_COLORS.optimal} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {/* ── Improvement summary ── */}
      {(isn || ios) && (
        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {isn && (
            <div style={{ background: "#1f2937", borderRadius: 10, padding: "12px 20px" }}>
              <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 8 }}>
                Smart vs Naive improvement
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <ImprovementBadge label="Throughput"    pct={isn.throughput_per_hour} />
                <ImprovementBadge label="Avg Time"      pct={isn.avg_time_per_pallet} lowerIsBetter />
                <ImprovementBadge label="Full Pallets %" pct={isn.full_pallets_pct} />
              </div>
            </div>
          )}
          {ios && (
            <div style={{
              background: "#1f2937", borderRadius: 10, padding: "12px 20px",
              border: "1px solid #22c55e44",
            }}>
              <div style={{ color: "#22c55e", fontSize: 11, marginBottom: 8, fontWeight: 600 }}>
                ✦ Optimal vs Smart improvement
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <ImprovementBadge label="Throughput"    pct={ios.throughput_per_hour} />
                <ImprovementBadge label="Avg Time"      pct={ios.avg_time_per_pallet} lowerIsBetter />
                <ImprovementBadge label="Full Pallets %" pct={ios.full_pallets_pct} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Progress bar (smart engine) ── */}
      {s && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>
            <span>Progress</span>
            <span>
              S {s.progress}% &nbsp;·&nbsp;
              N {n?.progress ?? 0}% &nbsp;·&nbsp;
              O {o?.progress ?? 0}%
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {(["smart", "naive", "optimal"] as const).map((algo) => {
              const m = algo === "smart" ? s : algo === "naive" ? n : o;
              return (
                <div key={algo} style={{ flex: 1, background: "#374151", borderRadius: 3, height: 5 }}>
                  <div style={{
                    width: `${m?.progress ?? 0}%`,
                    background: ALGO_COLORS[algo],
                    height: "100%", borderRadius: 3, transition: "width 0.4s",
                  }} />
                </div>
              );
            })}
          </div>
          {s.is_done && o?.is_done && n?.is_done && (
            <div style={{ marginTop: 6, color: "#22c55e", fontSize: 12, fontWeight: 600 }}>
              ✓ All three simulations complete
            </div>
          )}
        </div>
      )}
    </div>
  );
}
