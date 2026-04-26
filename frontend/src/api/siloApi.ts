import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000" });

// ── types ─────────────────────────────────────────────────────────────────────

export interface CellData {
  code: string | null;
  dest_idx: number | null;
  x: number;
  y: number;
  z: number;
  side: string;
}

export interface AisleState {
  aisle: string;
  cells: Record<string, CellData>;
  shuttles: Record<string, number>;
  dest_count: number;
}

export interface PalletInfo {
  destination: string;
  count: number;
  target: number;
}

export interface Metrics {
  boxes_arrived: number;
  boxes_placed: number;
  boxes_retrieved: number;
  completed_pallets: number;
  full_pallets_pct: number;
  total_input_time: number;
  total_output_time: number;
  total_time: number;
  avg_time_per_pallet: number;
  throughput_per_hour: number;
  peak_occupancy_pct: number;
  worst_case_pallet_s: number;
  pallet_time_stddev: number;
  occupied_cells: number;
  total_cells: number;
  active_pallets: PalletInfo[];
  is_done: boolean;
  progress: number;
}

export interface SimStatus {
  status: string;
  smart: Metrics;
  naive: Metrics;
  optimal: Metrics;
}

export interface ChartEntry {
  metric: string;
  naive: number;
  smart: number;
  optimal: number;
  unit: string;
}

export interface Improvement {
  full_pallets_pct: number;
  avg_time_per_pallet: number;
  throughput_per_hour: number;
}

export interface CompareResult {
  naive: Metrics;
  smart: Metrics;
  optimal: Metrics;
  improvement_smart_vs_naive: Improvement;
  improvement_optimal_vs_smart: Improvement;
  chart_data: ChartEntry[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const siloApi = {
  startSimulation: (numDestinations: number, totalBoxes: number, loadCsv = true) =>
    api.post("/api/simulation/start", {
      num_destinations: numDestinations,
      total_boxes: totalBoxes,
      load_csv: loadCsv,
    }),

  step: (nBoxes = 100) =>
    api.post<{ smart: Metrics; naive: Metrics; optimal: Metrics }>(
      "/api/simulation/step",
      { n_boxes: nBoxes },
    ),

  runFull: () => api.post("/api/simulation/run-full"),

  runOptimal: () => api.post("/api/simulation/run-optimal"),

  getStatus: () => api.get<SimStatus>("/api/simulation/status"),

  compare: () => api.get<CompareResult>("/api/simulation/compare"),

  compareAll: (numDest = 20, totalBoxes = 500) =>
    api.get<CompareResult>("/api/simulation/compare-all", {
      params: { num_destinations: numDest, total_boxes: totalBoxes },
      timeout: 60_000,
    }),

  reset: () => api.post("/api/simulation/reset"),

  getAisleState: (aisle: string, useSmart = true) =>
    api.get<AisleState>("/api/silo/state", {
      params: { aisle, use_smart: useSmart },
    }),

  getPallets: (useSmart = true) =>
    api.get("/api/silo/pallets", { params: { use_smart: useSmart } }),

  getShuttles: (useSmart = true) =>
    api.get("/api/silo/shuttles", { params: { use_smart: useSmart } }),
};
