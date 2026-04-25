import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  siloApi, AisleState, Metrics, ChartEntry, Improvement,
} from "./api/siloApi";
import SiloGrid from "./components/SiloGrid";
import Dashboard from "./components/Dashboard";
import Controls from "./components/Controls";

const POLL_MS = 2000;
type ViewMode = "smart" | "naive" | "optimal";

export default function App() {
  const [viewMode, setViewMode]         = useState<ViewMode>("smart");
  const [selectedAisle, setSelectedAisle] = useState("10");
  const [aisleState, setAisleState]     = useState<AisleState | null>(null);

  const [smartMetrics,   setSmartMetrics]   = useState<Metrics | null>(null);
  const [naiveMetrics,   setNaiveMetrics]   = useState<Metrics | null>(null);
  const [optimalMetrics, setOptimalMetrics] = useState<Metrics | null>(null);

  const [chartData,        setChartData]        = useState<ChartEntry[]>([]);
  const [impSmartVsNaive,  setImpSmartVsNaive]  = useState<Improvement | null>(null);
  const [impOptimalVsSmart, setImpOptimalVsSmart] = useState<Improvement | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [isDone,    setIsDone]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── polling ────────────────────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    try {
      const useSmart = viewMode !== "naive";
      const [statusRes, aisleRes] = await Promise.all([
        siloApi.getStatus(),
        siloApi.getAisleState(selectedAisle, useSmart),
      ]);
      if (statusRes.data.status !== "not_started") {
        setSmartMetrics(statusRes.data.smart);
        setNaiveMetrics(statusRes.data.naive);
        setOptimalMetrics(statusRes.data.optimal ?? null);
        const allDone =
          statusRes.data.smart.is_done &&
          statusRes.data.naive.is_done &&
          (statusRes.data.optimal?.is_done ?? true);
        setIsDone(allDone);
      }
      setAisleState(aisleRes.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message ?? "Connection error");
    }
  }, [selectedAisle, viewMode]);

  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(fetchState, POLL_MS);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [isRunning, fetchState]);

  useEffect(() => {
    if (isRunning) fetchState();
  }, [selectedAisle, viewMode, fetchState, isRunning]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleStart = async (numDest: number, totalBoxes: number) => {
    try {
      setError(null);
      await siloApi.startSimulation(numDest, totalBoxes, true);
      setIsRunning(true);
      setIsDone(false);
      setChartData([]);
      setImpSmartVsNaive(null);
      setImpOptimalVsSmart(null);
      await fetchState();
    } catch (e: any) { setError(e?.response?.data?.detail ?? e.message); }
  };

  const handleStep = async (n: number) => {
    try {
      await siloApi.step(n);
      await fetchState();
    } catch (e: any) { setError(e?.response?.data?.detail ?? e.message); }
  };

  const handleRunFull = async () => {
    try {
      await siloApi.runFull();
      setTimeout(fetchState, 600);
    } catch (e: any) { setError(e?.response?.data?.detail ?? e.message); }
  };

  const handleCompare = async () => {
    try {
      const res = await siloApi.compare();
      setChartData(res.data.chart_data);
      setSmartMetrics(res.data.smart);
      setNaiveMetrics(res.data.naive);
      setOptimalMetrics(res.data.optimal);
      setImpSmartVsNaive(res.data.improvement_smart_vs_naive);
      setImpOptimalVsSmart(res.data.improvement_optimal_vs_smart);
    } catch (e: any) { setError(e?.response?.data?.detail ?? e.message); }
  };

  const handleReset = async () => {
    try {
      await siloApi.reset();
      setIsRunning(false); setIsDone(false);
      setSmartMetrics(null); setNaiveMetrics(null); setOptimalMetrics(null);
      setAisleState(null); setChartData([]);
      setImpSmartVsNaive(null); setImpOptimalVsSmart(null);
      setError(null);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (e: any) { setError(e?.response?.data?.detail ?? e.message); }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const ALGO_COLORS: Record<ViewMode, string> = {
    smart: "#f59e0b", naive: "#ef4444", optimal: "#22c55e",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#111827", color: "#e5e7eb",
                  fontFamily: "sans-serif", padding: "20px 24px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14,
                    position: "sticky", top: -20, zIndex: 100,
                    background: "#111827", padding: "14px 24px",
                    margin: "-20px -24px 18px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "#f9fafb" }}>
            Silo Optimizer
          </h1>
        </div>

        {/* View-mode toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6,
                      background: "#1f2937", borderRadius: 8, padding: "4px 6px" }}>
          {(["smart", "naive", "optimal"] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: "5px 13px", borderRadius: 6, border: "none", cursor: "pointer",
              background: viewMode === m ? ALGO_COLORS[m] + "cc" : "transparent",
              color: "#e5e7eb",
              fontWeight: viewMode === m ? 700 : 400, fontSize: 12,
            }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: "#7f1d1d", color: "#fca5a5", borderRadius: 8,
                      padding: "10px 16px", marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <Controls
          onStart={handleStart} onStep={handleStep}
          onRunFull={handleRunFull} onReset={handleReset}
          onCompare={handleCompare}
          isRunning={isRunning} isDone={isDone}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <Dashboard
          smartMetrics={smartMetrics}
          naiveMetrics={naiveMetrics}
          optimalMetrics={optimalMetrics}
          chartData={chartData}
          impSmartVsNaive={impSmartVsNaive}
          impOptimalVsSmart={impOptimalVsSmart}
        />
      </div>

      <div style={{ background: "#1f2937", borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#d1d5db",
                      display: "flex", alignItems: "center", gap: 8 }}>
          Silo Visualisation
          <span style={{ fontSize: 11, color: ALGO_COLORS[viewMode],
                         background: ALGO_COLORS[viewMode] + "22",
                         padding: "1px 8px", borderRadius: 4 }}>
            {viewMode}
          </span>
        </div>
        <SiloGrid
          state={aisleState}
          selectedAisle={selectedAisle}
          onAisleChange={setSelectedAisle}
          useSmart={viewMode !== "naive"}
        />
      </div>

      <div style={{ marginTop: 18, color: "#374151", fontSize: 10, textAlign: "center" }}>
        32 shuttles · 7 680 positions · 4 aisles × 2 sides × 60 × 8 × 2
      </div>
    </div>
  );
}
