import { clockLabel, type Comparison } from "@/lib/timeline";
import { WEEKDAYS } from "@/lib/sim";
import { PassengerBalance, type PassengerForecast } from "@/components/PassengerBalance";

const STATUS_LABEL = {
  ativo: "Active",
  "parada programada": "Stop scheduled",
  parado: "Stopped",
  "substituído": "Replaced",
  "aguardando intervalo": "Waiting for departure slot",
} satisfies Record<Comparison["status"], string>;
const serviceLabel = (service: string) => service === "Sem composição" ? "No train assigned" : service;

export function TrainComparison({ rows, forecast }: { rows: Comparison[]; forecast?: PassengerForecast | undefined }) {
  const current = rows.at(-1);
  if (!current) return null;
  return <section className="mt-4 border-t border-border pt-3" aria-label="Daily train comparison">
    <h3 className="font-mono text-sm font-semibold">Day-by-day comparison</h3>
    <p className="mt-1 text-[11px] text-muted-foreground">Estimated simulation times · destination arrival, not official DB schedules.</p>
    <p className="my-2 text-primary">{serviceLabel(current.service)} · {STATUS_LABEL[current.status]}</p>
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-card"><tr><th className="py-2">Day</th><th className="py-2">No intervention</th><th className="py-2">Your scenario</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.day} className="border-t border-border align-top">
          <td className="py-2 pr-1"><b>{r.day + 1} · {WEEKDAYS[r.day % 7]}</b><div className="text-muted-foreground">{STATUS_LABEL[r.status]}</div></td>
          <td className="py-2"><div className="font-mono">{clockLabel(r.arrivalBefore)}</div><div className="text-muted-foreground">{r.before} min delay</div><div className="text-muted-foreground">Sched. {clockLabel(r.scheduled)}</div></td>
          <td className="py-2"><div className="font-mono text-primary">{r.arrivalAfter === null ? "No arrival" : clockLabel(r.arrivalAfter)}</div><div>{r.after === null ? "Service interrupted" : `${r.after} min delay`}</div>{r.after !== null && <div className={r.after <= r.before ? "text-ok" : "text-late"}>{r.after - r.before > 0 ? "+" : ""}{Math.round((r.after - r.before) * 10) / 10} min</div>}{r === current && forecast && <PassengerBalance forecast={forecast} />}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}