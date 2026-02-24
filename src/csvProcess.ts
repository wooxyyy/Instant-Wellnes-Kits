import fs from "fs";
import csv from "csv-parser";
import { resolveCity } from "./geo";
import { resolvePubRate } from "./pubRates";

type TaxOutput = {
  timestamp: string;
  composite_tax_rate: number;
  tax_amount: number;
  total_amount: number;
  breakdown: {
    state_rate: number;
    county_rate: number;
    city_rate: number;
    special_rates: Array<{ name: string; rate: number }>;
  };
  jurisdictions: {
    state: string;
    county?: string;
    city?: string;
    reporting_code?: string;
  };
};

type FormatJurisdictions = {
  state?: string;
  county?: string | null;
  city?: string | null;
  reporting_code?: string | null;
  region_code?: string | null;
  outside_county_rate?: number | null;
  rate_kind?: string | null;
};

type TaxLookup = ReturnType<typeof resolvePubRate>;

const STATE_RATE = 0.04;
const RATE_SCALE = 1_000_000n;

function parseDecimalParts(raw: string) {
  const value = raw.trim();
  const match = value.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1n : 1n;
  const intPart = match[2];
  const fracPart = match[3] ?? "";

  return { sign, intPart, fracPart };
}

function parseToScaledInt(value: number | string, scaleDigits: number): bigint {
  const parts = parseDecimalParts(String(value));
  if (!parts) return 0n;

  const base = BigInt(parts.intPart + parts.fracPart.padEnd(scaleDigits, "0").slice(0, scaleDigits));
  const nextDigit = Number(parts.fracPart.charAt(scaleDigits) || "0");
  const rounded = nextDigit >= 5 ? base + 1n : base;
  return rounded * parts.sign;
}

function roundHalfUpDivide(numerator: bigint, denominator: bigint): bigint {
  if (numerator >= 0n) {
    return (numerator + denominator / 2n) / denominator;
  }
  return (numerator - denominator / 2n) / denominator;
}

function subtotalToCents(subtotal: number | string): bigint {
  return parseToScaledInt(subtotal, 2);
}

function rateToMicros(rate: number): bigint {
  const rawRate = String(rate).trim();
  const asNumber = Number(rawRate);
  if (!Number.isFinite(asNumber)) return 0n;

  const rateParts = parseDecimalParts(rawRate);
  if (!rateParts) return 0n;

  const baseScale = 10n ** BigInt(rateParts.fracPart.length);
  const baseValue = BigInt(rateParts.intPart + rateParts.fracPart) * rateParts.sign;
  const divisor = asNumber > 1 ? baseScale * 100n : baseScale;

  return roundHalfUpDivide(baseValue * RATE_SCALE, divisor);
}

function microsToRate(micros: bigint): number {
  return Number(micros) / Number(RATE_SCALE);
}

function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}

function rateDiff(a: bigint, b: bigint): bigint {
  return a >= b ? a - b : 0n;
}

function roundMoney(n: number | string): number {
  return centsToNumber(subtotalToCents(n));
}

function resolveOrderTimestamp(timestamp: unknown): string {
  if (typeof timestamp === "string" && timestamp.trim().length > 0) {
    return timestamp.trim();
  }

  return new Date().toISOString();
}

export function formatTaxOutput(
  order: any,
  rate: number,
  jurisdictions: FormatJurisdictions
): TaxOutput {
  const compositeRateMicros = rateToMicros(rate);
  const composite_tax_rate = microsToRate(compositeRateMicros);

  const subtotalCents = subtotalToCents(order.subtotal);
  const taxCents = roundHalfUpDivide(subtotalCents * compositeRateMicros, RATE_SCALE);
  const totalCents = subtotalCents + taxCents;

  const stateRateMicros = rateToMicros(STATE_RATE);
  const outsideCountyMicros =
    jurisdictions.outside_county_rate != null ? rateToMicros(jurisdictions.outside_county_rate) : null;

  const canSplitCity =
    jurisdictions.rate_kind === "city" &&
    outsideCountyMicros != null &&
    outsideCountyMicros >= stateRateMicros &&
    compositeRateMicros >= outsideCountyMicros;

  const countyRateMicros = canSplitCity
    ? rateDiff(outsideCountyMicros!, stateRateMicros)
    : rateDiff(compositeRateMicros, stateRateMicros);
  const cityRateMicros = canSplitCity ? compositeRateMicros - outsideCountyMicros! : 0n;

  const jurisdictionsOutput: TaxOutput["jurisdictions"] = {
    state: jurisdictions.state ?? "New York"
  };

  if (jurisdictions.county) jurisdictionsOutput.county = jurisdictions.county;
  if (jurisdictions.city) jurisdictionsOutput.city = jurisdictions.city;
  if (jurisdictions.reporting_code) jurisdictionsOutput.reporting_code = jurisdictions.reporting_code;
  else if (jurisdictions.region_code) jurisdictionsOutput.reporting_code = jurisdictions.region_code;

  return {
    timestamp: resolveOrderTimestamp(order.timestamp),
    composite_tax_rate,
    tax_amount: roundMoney(centsToNumber(taxCents)),
    total_amount: roundMoney(centsToNumber(totalCents)),
    breakdown: {
      state_rate: STATE_RATE,
      county_rate: microsToRate(countyRateMicros),
      city_rate: microsToRate(cityRateMicros),
      special_rates: []
    },
    jurisdictions: jurisdictionsOutput
  };
}

export function processCSV(path: string) {
  fs.createReadStream(path)
    .pipe(csv())
    .on("data", (row: any) => {
      const result = calculateOrderTaxByCoordinates(row);
      console.log({
        order_id: row.id,
        ...result
      });
    })
    .on("end", () => {
      console.log("CSV processed");
    });
}

export function calculateOrderTaxByCoordinates(order: {
  latitude: number | string;
  longitude: number | string;
  subtotal: number | string;
  timestamp?: string;
}) {
  const lat = Number(order.latitude);
  const lon = Number(order.longitude);
  const subtotal = Number(order.subtotal);

  const location = resolveCity(lat, lon);
  const pubRate: TaxLookup =
    location && location.county ? resolvePubRate(location.county, location.city ?? null) : null;

  const rate = pubRate?.tax_rate_decimal ?? null;
  const output =
    rate != null && Number.isFinite(subtotal)
      ? formatTaxOutput(order, rate, {
          state: location?.state ?? "New York",
          county: location?.county ?? undefined,
          city: location?.city ?? undefined,
          reporting_code: pubRate?.reporting_code ?? undefined,
          outside_county_rate: pubRate?.outside_county_rate_decimal ?? null,
          rate_kind: pubRate?.tax_source_kind ?? null
        })
      : null;

  return (
    output ?? {
      timestamp: resolveOrderTimestamp(order.timestamp),
      composite_tax_rate: null,
      tax_amount: null,
      total_amount: null,
      breakdown: {
        state_rate: STATE_RATE,
        county_rate: 0,
        city_rate: 0,
        special_rates: []
      },
      jurisdictions: {
        state: location?.state ?? "New York",
        county: location?.county ?? undefined,
        city: location?.city ?? undefined,
        reporting_code: pubRate?.reporting_code ?? undefined
      }
    }
  );
}
