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
}

export interface ChartEntry {
  metric: string;
  smart: number;
  naive: number;
  unit: string;
}

export interface CompareResult {
  smart: Metrics;
  naive: Metrics;
  improvement: Record<string, number>;
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
    api.post<{ smart: Metrics; naive: Metrics }>("/api/simulation/step", {
      n_boxes: nBoxes,
    }),

  runFull: () => api.post("/api/simulation/run-full"),

  getStatus: () => api.get<SimStatus>("/api/simulation/status"),

  compare: () => api.get<CompareResult>("/api/simulation/compare"),

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
