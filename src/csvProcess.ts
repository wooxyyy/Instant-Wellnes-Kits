import fs from "fs";
import csv from "csv-parser";
import { resolveCity } from "./geo";
import { resolvePubRate } from "./pubRates";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function processCSV(path: string) {
  fs.createReadStream(path)
    .pipe(csv())
    .on("data", (row: any) => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);

      const location = resolveCity(lat, lon);
      const subtotal = Number(row.subtotal);
      const pubRate =
        location && location.county
          ? resolvePubRate(location.county, location.city ?? null)
          : null;

      const tax =
        pubRate && Number.isFinite(subtotal) ? roundMoney(subtotal * pubRate.tax_rate_decimal) : null;
      const total =
        pubRate && Number.isFinite(subtotal) ? roundMoney(subtotal + (tax ?? 0)) : null;

      console.log({
        ...row,
        ...(location ?? {}),
        ...(pubRate ?? {}),
        tax,
        total
      });
    })
    .on("end", () => {
      console.log("CSV processed");
    });
}
