# Instant Wellness Kits

Lightweight web app and CLI for NY order tax calculation by coordinates.

## Features
- Tax calculation by `latitude`, `longitude`, `subtotal`
- Automatic location resolution (`state`, `county`, `city`)
- Interactive single order flow in web UI
- Batch order flow (CSV-format inputs) in web UI
- Order persistence to:
  - `data/input.csv`
  - SQLite database `data/orders.db`

## CSV Format
```csv
id,longitude,latitude,timestamp,subtotal
```

Example:
```text
21,-73.91910843778155,40.6671997058511,2025-11-11 18:33:45.288054025,120.0
```

## Requirements
- Node.js 22+
- npm

## Install
```bash
npm install
```

## Run
```bash
npm run start:web
```
Open: `http://localhost:3000`

## Other Modes
```bash
npm run start:interactive
npm run start:csv
```

## Type Check
```bash
npx tsc --noEmit
```

## Data Storage
- CSV file: `data/input.csv`
- SQLite DB: `data/orders.db` (table: `orders`)
