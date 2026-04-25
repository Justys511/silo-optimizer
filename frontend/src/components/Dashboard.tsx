import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Metrics, ChartEntry } from "../api/siloApi";

interface Props {
  smartMetrics: Metrics | null;
  naiveMetrics: Metrics | null;
  chartData: ChartEntry[];
}

function MetricCard({
  label, value, sub, color = "#3b82f6",
}: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#1f2937", borderRadius: 10, padding: "14px 18px",
      minWidth: 140, flex: 1,
    }}>
      <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PalletBar({ dest, count, target }: { dest: string; count: number; target: number }) {
  const pct = Math.min((count / target) * 100, 100);
  const color = pct >= 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#3b82f6";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>
        <span style={{ fontFamily: "monospace" }}>…{dest.slice(-6)}</span>
        <span>{count} / {target}</span>
      </div>
      <div style={{ background: "#374151", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export default function Dashboard({ smartMetrics: s, naiveMetrics: n, chartData }: Props) {
  const noData = !s || !n;

  return (
    <div style={{ fontFamily: "sans-serif", color: "#e5e7eb" }}>
      {/* ── Top metrics row ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <MetricCard
          label="Full Pallets % (Smart)"
          value={noData ? "—" : `${s!.full_pallets_pct}%`}
          sub={noData ? undefined : `vs naive ${n!.full_pallets_pct}%`}
          color="#22c55e"
        />
        <MetricCard
          label="Completed Pallets"
          value={noData ? "—" : s!.completed_pallets}
          sub={noData ? undefined : `naive: ${n!.completed_pallets}`}
          color="#3b82f6"
        />
        <MetricCard
          label="Throughput (p/hr)"
          value={noData ? "—" : s!.throughput_per_hour}
          sub={noData ? undefined : `naive: ${n!.throughput_per_hour}`}
          color="#f59e0b"
        />
        <MetricCard
          label="Avg Time / Pallet (s)"
          value={noData ? "—" : s!.avg_time_per_pallet}
          sub={noData ? undefined : `naive: ${n!.avg_time_per_pallet}`}
          color="#8b5cf6"
        />
        <MetricCard
          label="Boxes Placed"
          value={noData ? "—" : s!.boxes_placed}
          sub={noData ? undefined : `arrived: ${s!.boxes_arrived}`}
          color="#ec4899"
        />
        <MetricCard
          label="Silo Occupancy"
          value={noData ? "—" : `${Math.round((s!.occupied_cells / s!.total_cells) * 100)}%`}
          sub={noData ? undefined : `${s!.occupied_cells} / ${s!.total_cells}`}
          color="#14b8a6"
        />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* ── Active pallets ── */}
        <div style={{ background: "#1f2937", borderRadius: 10, padding: 16, minWidth: 260, flex: "0 0 auto" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#d1d5db" }}>
            Active Pallets (Smart) — up to 8
          </div>
          {noData || s!.active_pallets.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No active pallets yet</div>
          ) : (
            s!.active_pallets.map((p) => (
              <PalletBar key={p.destination} dest={p.destination} count={p.count} target={p.target} />
            ))
          )}
        </div>

        {/* ── Comparison chart ── */}
        <div style={{ background: "#1f2937", borderRadius: 10, padding: 16, flex: 1, minWidth: 320 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#d1d5db" }}>
            Smart vs Naive Comparison
          </div>
          {chartData.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13, paddingTop: 20 }}>
              Run the simulation to see the comparison
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6 }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(val: any, name: any) =>
                    [`${val}`, String(name)]
                  }
                />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Bar dataKey="smart" name="Smart" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="naive" name="Naive (FIFO)" fill="#6b7280" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {s && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
            <span>Simulation progress</span>
            <span>{s.progress}%</span>
          </div>
          <div style={{ background: "#374151", borderRadius: 4, height: 6 }}>
            <div
              style={{
                width: `${s.progress}%`, background: s.is_done ? "#22c55e" : "#3b82f6",
                height: "100%", borderRadius: 4, transition: "width 0.4s",
              }}
            />
          </div>
          {s.is_done && (
            <div style={{ marginTop: 8, color: "#22c55e", fontSize: 13, fontWeight: 600 }}>
              ✓ Simulation complete
            </div>
          )}
        </div>
      )}
    </div>
  );
}
