import fs from "fs";

type PubRateRow = {
  locality: string;
  base: string;
  kind: string;
  parent_county: string | null;
  tax_rate_percent: number;
  tax_rate_decimal: number;
  reporting_code: string;
};

type PubRatesFile = {
  rows: PubRateRow[];
};

const NYC_COUNTIES = new Set(["BRONX", "KINGS", "NEW YORK", "QUEENS", "RICHMOND"]);

const pubRates = JSON.parse(
  fs.readFileSync("pub718_rates_2025-03-01.json", "utf8")
) as PubRatesFile;

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/\s*\(CITY\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findCityRate(county: string, city: string): PubRateRow | null {
  if (!city) return null;

  const normalizedCounty = normalizeName(county);
  const normalizedCity = normalizeName(city);

  const row = pubRates.rows.find(
    (candidate) =>
      candidate.kind === "city" &&
      normalizeName(candidate.parent_county) === normalizedCounty &&
      normalizeName(candidate.base) === normalizedCity
  );

  return row ?? null;
}

export function resolvePubRate(county: string, city: string | null) {
  const normalizedCounty = normalizeName(county);
  const normalizedCity = normalizeName(city);

  let row: PubRateRow | null = null;

  if (NYC_COUNTIES.has(normalizedCounty)) {
    row = pubRates.rows.find((candidate) => candidate.kind === "nyc") ?? null;
  }

  if (!row) {
    row = findCityRate(normalizedCounty, normalizedCity);
  }

  if (!row) {
    row =
      pubRates.rows.find(
        (candidate) =>
          candidate.kind === "county_outside" && normalizeName(candidate.base) === normalizedCounty
      ) ?? null;
  }

  if (!row) {
    row =
      pubRates.rows.find(
        (candidate) => candidate.kind === "county" && normalizeName(candidate.base) === normalizedCounty
      ) ?? null;
  }

  if (!row) {
    row = pubRates.rows.find((candidate) => candidate.kind === "state_only") ?? null;
  }

  if (!row) return null;

  return {
    reporting_code: row.reporting_code,
    tax_rate_percent: row.tax_rate_percent,
    tax_rate_decimal: row.tax_rate_decimal,
    tax_source_kind: row.kind,
    tax_source_locality: row.locality
  };
}
