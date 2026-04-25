import React, { useState, useEffect, useCallback, useRef } from "react";
import { siloApi, AisleState, Metrics, ChartEntry } from "./api/siloApi";
import SiloGrid from "./components/SiloGrid";
import Dashboard from "./components/Dashboard";
import Controls from "./components/Controls";

const POLL_MS = 2000;

export default function App() {
  const [selectedAisle, setSelectedAisle] = useState("10");
  const [useSmart, setUseSmart] = useState(true);
  const [aisleState, setAisleState] = useState<AisleState | null>(null);
  const [smartMetrics, setSmartMetrics] = useState<Metrics | null>(null);
  const [naiveMetrics, setNaiveMetrics] = useState<Metrics | null>(null);
  const [chartData, setChartData] = useState<ChartEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── polling ────────────────────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    try {
      const [statusRes, aisleRes] = await Promise.all([
        siloApi.getStatus(),
        siloApi.getAisleState(selectedAisle, useSmart),
      ]);
      if (statusRes.data.status !== "not_started") {
        setSmartMetrics(statusRes.data.smart);
        setNaiveMetrics(statusRes.data.naive);
        setIsDone(statusRes.data.smart.is_done);
      }
      setAisleState(aisleRes.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message ?? "Connection error");
    }
  }, [selectedAisle, useSmart]);

  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(fetchState, POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [isRunning, fetchState]);

  useEffect(() => {
    if (isRunning) fetchState();
  }, [selectedAisle, useSmart, fetchState, isRunning]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleStart = async (numDest: number, totalBoxes: number) => {
    try {
      setError(null);
      await siloApi.startSimulation(numDest, totalBoxes, true);
      setIsRunning(true);
      setIsDone(false);
      setChartData([]);
      await fetchState();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  };

  const handleStep = async (n: number) => {
    try {
      await siloApi.step(n);
      await fetchState();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  };

  const handleRunFull = async () => {
    try {
      await siloApi.runFull();
      setTimeout(fetchState, 500);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  };

  const handleCompare = async () => {
    try {
      const res = await siloApi.compare();
      setChartData(res.data.chart_data);
      setSmartMetrics(res.data.smart);
      setNaiveMetrics(res.data.naive);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  };

  const handleReset = async () => {
    try {
      await siloApi.reset();
      setIsRunning(false);
      setIsDone(false);
      setSmartMetrics(null);
      setNaiveMetrics(null);
      setAisleState(null);
      setChartData([]);
      setError(null);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111827",
        color: "#e5e7eb",
        fontFamily: "sans-serif",
        padding: "20px 24px",
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f9fafb" }}>
            Silo Optimizer
          </h1>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
            Inditex Tech Challenge — HackUPC 2026
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            background: "#1f2937",
            borderRadius: 8,
            padding: "4px 6px",
          }}
        >
          {([true, false] as const).map((smart) => (
            <button
              key={String(smart)}
              onClick={() => setUseSmart(smart)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: useSmart === smart ? (smart ? "#2563eb" : "#6b7280") : "transparent",
                color: "#e5e7eb",
                fontWeight: useSmart === smart ? 700 : 400,
                fontSize: 13,
              }}
            >
              {smart ? "Smart" : "Naive"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#7f1d1d",
            color: "#fca5a5",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <Controls
          onStart={handleStart}
          onStep={handleStep}
          onRunFull={handleRunFull}
          onReset={handleReset}
          onCompare={handleCompare}
          isRunning={isRunning}
          isDone={isDone}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <Dashboard
          smartMetrics={smartMetrics}
          naiveMetrics={naiveMetrics}
          chartData={chartData}
        />
      </div>

      <div style={{ background: "#1f2937", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#d1d5db" }}>
          Silo Visualisation
        </div>
        <SiloGrid
          state={aisleState}
          selectedAisle={selectedAisle}
          onAisleChange={(a) => setSelectedAisle(a)}
          useSmart={useSmart}
        />
      </div>

      <div style={{ marginTop: 20, color: "#374151", fontSize: 11, textAlign: "center" }}>
        32 shuttles · 7 680 positions · 4 aisles × 2 sides × 60 × 8 × 2
      </div>
    </div>
  );
}
