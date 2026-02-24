import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export type StoredOrder = {
  order_id: string;
  longitude: number;
  latitude: number;
  timestamp: string;
  subtotal: number;
  source: string;
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "orders.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    longitude REAL NOT NULL,
    latitude REAL NOT NULL,
    timestamp TEXT NOT NULL,
    subtotal REAL NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertOrderStmt = db.prepare(`
  INSERT INTO orders (order_id, longitude, latitude, timestamp, subtotal, source)
  VALUES (?, ?, ?, ?, ?, ?);
`);

export function saveOrdersToDatabase(orders: StoredOrder[]) {
  if (orders.length === 0) return;

  db.exec("BEGIN");
  try {
    for (const row of orders) {
      insertOrderStmt.run(
        row.order_id,
        row.longitude,
        row.latitude,
        row.timestamp,
        row.subtotal,
        row.source
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
