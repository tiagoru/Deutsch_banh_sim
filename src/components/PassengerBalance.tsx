import type { Option } from "@/lib/depots";

export type PassengerForecast = { option: Option; passengers: number };

export function PassengerBalance({ forecast }: { forecast: PassengerForecast }) {
  const { option, passengers } = forecast;
  if (!option.available) return <div className="mt-2 text-warn">Forecast unavailable · no reserve available now.</div>;
  const hours = Math.round(option.net / 60);
  return <div className="mt-2" aria-label="Passenger balance forecast">
    <div className={option.net >= 0 ? "text-ok" : "text-late"}>
      Forecast balance: <b>{hours > 0 ? "+" : ""}{hours} passenger-hours</b>
    </div>
    <div className="text-muted-foreground">{passengers} estimated passengers · estimated wait {option.wait} min</div>
    <div className="text-muted-foreground">{option.net > 0 ? "Net time saved" : option.net < 0 ? "Net additional time" : "No net gain"} compared with keeping the train in service.</div>
    <div className="text-muted-foreground">Simulation forecast; result recorded on arrival at the station. May change before the stop.</div>
  </div>;
}