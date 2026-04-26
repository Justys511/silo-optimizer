import React from "react";
import { Metrics } from "../api/siloApi";

const ALGO_COLORS = { naive: "#ef4444", smart: "#f59e0b", optimal: "#22c55e" };

interface Props {
  smartMetrics:   Metrics | null;
  naiveMetrics:   Metrics | null;
  optimalMetrics: Metrics | null;
  viewMode: "smart" | "naive" | "optimal";
}

// ── sub-components ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: "4px 12px", fontSize: 16, fontWeight: 600,
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
    <div style={{ background: "#1f2937", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 200 }}>
      <div style={{ color: "#9ca3af", fontSize: 20, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {values.map(({ algo, val }) => (
          <div key={algo}>
            <div style={{ color: ALGO_COLORS[algo], fontSize: 34, fontWeight: 700, fontFamily: "monospace" }}>
              {val}
            </div>
            <div style={{ color: "#6b7280", fontSize: 15 }}>{algo}</div>
          </div>
        ))}
      </div>
      {sub && <div style={{ color: "#6b7280", fontSize: 14, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function PalletBar({ dest, count, target }: { dest: string; count: number; target: number }) {
  const pct = Math.min((count / target) * 100, 100);
  const color = pct >= 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#3b82f6";
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#9ca3af", marginBottom: 4 }}>
        <span style={{ fontFamily: "monospace" }}>…{dest.slice(-6)}</span>
        <span>{count} / {target}</span>
      </div>
      <div style={{ background: "#374151", borderRadius: 3, height: 8 }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Dashboard({
  smartMetrics: s, naiveMetrics: n, optimalMetrics: o, viewMode,
}: Props) {
  const active = viewMode === "naive" ? n : viewMode === "optimal" ? o : s;

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
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Badge label="Naive (FIFO)" color={ALGO_COLORS.naive} />
        <Badge label="Smart (greedy)"  color={ALGO_COLORS.smart} />
        <Badge label="Optimal (Hungarian + Hot/Cold + EMA)" color={ALGO_COLORS.optimal} />
      </div>

      {/* ── Metric cards row 1: core throughput ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {row("Completed Pallets",   "completed_pallets")}
        {row("Full Pallets %",      "full_pallets_pct",    (v) => `${v}%`)}
        {row("Throughput (p/hr)",   "throughput_per_hour", (v) => v)}
        {row("Avg Time/Pallet (s)", "avg_time_per_pallet", (v) => Math.round(v))}
      </div>

      {/* ── Metric cards row 2: consistency & utilization ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {row("Worst-case Pallet (s)", "worst_case_pallet_s", (v) => Math.round(v), "max single pallet time")}
        {row("Pallet Stddev (s)",     "pallet_time_stddev",  (v) => Math.round(v), "lower = more predictable")}
        {row("Peak Occupancy %",      "peak_occupancy_pct",  (v) => `${v}%`,       "max silo fill reached")}
      </div>

      {/* ── Silo status bar ── */}
      {active && (() => {
        const occPct = Math.round((active.occupied_cells / active.total_cells) * 100);
        const dropped = active.boxes_arrived - active.boxes_placed;
        const dropPct = active.boxes_arrived > 0 ? Math.round(dropped / active.boxes_arrived * 100) : 0;
        const occColor = occPct >= 95 ? "#ef4444" : occPct >= 80 ? "#f59e0b" : "#22c55e";
        return (
          <div style={{ background: "#1f2937", borderRadius: 10, padding: "16px 20px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#9ca3af", marginBottom: 6 }}>
                  <span>Silo Occupancy — {viewMode}</span>
                  <span style={{ color: occColor, fontWeight: 700 }}>{occPct}% · {active.occupied_cells} / {active.total_cells}</span>
                </div>
                <div style={{ background: "#374151", borderRadius: 4, height: 12 }}>
                  <div style={{ width: `${occPct}%`, background: occColor, height: "100%", borderRadius: 4, transition: "width 0.4s" }} />
                </div>
                {occPct >= 95 && (
                  <div style={{ color: "#ef4444", fontSize: 14, marginTop: 5, fontWeight: 600 }}>
                    ⚠ Silo full — incoming boxes are being dropped
                  </div>
                )}
              </div>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 20, marginBottom: 4 }}>Boxes Arrived / Placed / Dropped</div>
                <div style={{ fontSize: 20, fontFamily: "monospace" }}>
                  <span style={{ color: "#e5e7eb" }}>{active.boxes_arrived}</span>
                  <span style={{ color: "#6b7280" }}> / </span>
                  <span style={{ color: "#22c55e" }}>{active.boxes_placed}</span>
                  <span style={{ color: "#6b7280" }}> / </span>
                  <span style={{ color: dropped > 0 ? "#ef4444" : "#6b7280", fontWeight: dropped > 0 ? 700 : 400 }}>
                    {dropped}{dropped > 0 ? ` (${dropPct}%)` : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Active pallets ── */}
      <div style={{ background: "#1f2937", borderRadius: 10, padding: 18, marginBottom: 0 }}>
        <div style={{ fontSize: 23, fontWeight: 600, marginBottom: 14, color: "#d1d5db" }}>
          Active Pallets — {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
        </div>
        {!active || active.active_pallets.length === 0
          ? <div style={{ color: "#6b7280", fontSize: 16 }}>No active pallets</div>
          : active.active_pallets.map((p) => (
              <PalletBar key={p.destination} dest={p.destination} count={p.count} target={p.target} />
            ))}
      </div>

      {/* ── Progress bar (all engines) ── */}
      {s && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#9ca3af", marginBottom: 5 }}>
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
                <div key={algo} style={{ flex: 1, background: "#374151", borderRadius: 3, height: 7 }}>
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
            <div style={{ marginTop: 10, color: "#22c55e", fontSize: 16, fontWeight: 600 }}>
              ✓ All three simulations complete
            </div>
          )}
        </div>
      )}
    </div>
  );
}
