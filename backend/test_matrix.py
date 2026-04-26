import sys
sys.path.insert(0, ".")
from simulation.generator import SimulationEngine

DEST_OPTS  = [10, 20, 40, 60, 80, 100]
BOXES_OPTS = [500, 1000, 2000, 3000, 5000, 7680]

def run(mode, n_dest, n_boxes):
    e = SimulationEngine(mode=mode)
    e.initialize(num_destinations=n_dest, total_boxes=n_boxes)
    m = e.run_full()
    drp = m["boxes_arrived"] - m["boxes_placed"]
    return {
        "pallets":  m["completed_pallets"],
        "tput":     m["throughput_per_hour"],
        "avg_s":    m["avg_time_per_pallet"],
        "worst_s":  m["worst_case_pallet_s"],
        "stddev":   m["pallet_time_stddev"],
        "peak_pct": m["peak_occupancy_pct"],
        "full_pct": m["full_pallets_pct"],
        "dropped":  drp,
    }

header = (
    f"{'Dest':>5} {'Boxes':>6} │ "
    f"{'N_pal':>5} {'N_tput':>6} {'N_drp':>5} │ "
    f"{'S_pal':>5} {'S_tput':>6} {'S_drp':>5} │ "
    f"{'O_pal':>5} {'O_tput':>6} {'O_drp':>5} │ "
    f"{'Winner':>8}"
)
sep = "─" * len(header)

print(header)
print(sep)

for nd in DEST_OPTS:
    for nb in BOXES_OPTS:
        rn = run("naive",   nd, nb)
        rs = run("smart",   nd, nb)
        ro = run("optimal", nd, nb)

        # winner by pallets, tiebreak by throughput
        scores = {"naive": (rn["pallets"], rn["tput"]),
                  "smart": (rs["pallets"], rs["tput"]),
                  "optimal": (ro["pallets"], ro["tput"])}
        winner = max(scores, key=lambda k: scores[k])
        w_label = {"naive":"N","smart":"S","optimal":"O+"}[winner]
        if scores["optimal"] == scores["smart"] and winner != "naive":
            w_label = "S=O"

        print(
            f"{nd:>5} {nb:>6} │ "
            f"{rn['pallets']:>5} {rn['tput']:>6.2f} {rn['dropped']:>5} │ "
            f"{rs['pallets']:>5} {rs['tput']:>6.2f} {rs['dropped']:>5} │ "
            f"{ro['pallets']:>5} {ro['tput']:>6.2f} {ro['dropped']:>5} │ "
            f"{w_label:>8}"
        )
    print(sep)

print("\nLegend: N=Naive wins, S=Smart wins, O+=Optimal wins, S=O=tie")
print("tput = pallets/hour  |  drp = dropped boxes")
