import fs from "fs";
import * as turf from "@turf/turf";
import { feature } from "topojson-client";

const nyTopo = JSON.parse(
  fs.readFileSync("data/new_york.json", "utf8")
);

const cities = JSON.parse(
  fs.readFileSync("data/NY.json", "utf8")
);

const countiesGeo = feature(
  nyTopo,
  nyTopo.objects.counties
) as any;

function distanceKm(a: [number, number], b: [number, number]) {
  return turf.distance(turf.point(a), turf.point(b), { units: "kilometers" });
}

/* 🔴 ВАЖНО: export */
export function resolveCity(lat: number, lon: number) {
  const point = turf.point([lon, lat]);

  const countyFeature = countiesGeo.features.find((f: any) =>
    turf.booleanPointInPolygon(point, f)
  );

  if (!countyFeature) return null;

  const countyName = countyFeature.properties.name.toUpperCase();

  const citiesInCounty = cities.filter(
    (c: any) => c.county.toUpperCase() === countyName
  );

  let nearest = citiesInCounty[0];
  let minDist = Infinity;

  for (const c of citiesInCounty) {
    const d = distanceKm(
      [lon, lat],
      [Number(c.longitude), Number(c.latitude)]
    );
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }

  return {
    state: "New York",
    county: countyName,
    city: nearest?.city ?? null
  };
}