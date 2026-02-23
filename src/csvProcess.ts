import fs from "fs";
import csv from "csv-parser";
import { resolveCity } from "./geo";

export function processCSV(path: string) {
  fs.createReadStream(path)
    .pipe(csv())
    .on("data", (row: any) => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);

      const location = resolveCity(lat, lon);

      console.log({
        ...row,
        ...location
      });
    })
    .on("end", () => {
      console.log("CSV processed");
    });
}