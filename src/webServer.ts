import http from "http";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { calculateOrderTaxByCoordinates } from "./csvProcess";
import { saveOrdersToDatabase, type StoredOrder } from "./orderDatabase";

type OrderInput = {
  id?: string | number;
  latitude: number | string;
  longitude: number | string;
  subtotal: number | string;
  timestamp?: string;
};

type BatchPayload = {
  orders?: Array<Partial<OrderInput>>;
  source?: string;
};

type NormalizedOrder = {
  id: string;
  latitude: number;
  longitude: number;
  subtotal: number;
  timestamp: string;
};

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const INPUT_CSV_PATH = path.resolve(process.cwd(), "data", "input.csv");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invalid request";
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  res.end(JSON.stringify(payload, null, 2));
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function formatCurrentTimestampForCsv() {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");

  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(
    now.getMinutes()
  )}:${pad2(now.getSeconds())}.${pad3(now.getMilliseconds())}000000`;
}

function formatNumberForCsv(value: number) {
  if (Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function ensureInputCsvFile() {
  if (fs.existsSync(INPUT_CSV_PATH)) return;
  fs.writeFileSync(INPUT_CSV_PATH, "id,longitude,latitude,timestamp,subtotal\n", "utf8");
}

function appendOrderToInputCsv(order: NormalizedOrder) {
  ensureInputCsvFile();
  const csvLine = `${order.id},${formatNumberForCsv(order.longitude)},${formatNumberForCsv(order.latitude)},${
    order.timestamp
  },${formatNumberForCsv(order.subtotal)}\n`;
  fs.appendFileSync(INPUT_CSV_PATH, csvLine, "utf8");
}

function normalizeOrder(order: Partial<OrderInput>): NormalizedOrder {
  const id = String(order.id ?? "").trim();
  if (!id) {
    throw new Error("Order id is required.");
  }

  const latitude = Number(order.latitude);
  const longitude = Number(order.longitude);
  const subtotal = Number(order.subtotal);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(subtotal)) {
    throw new Error("Latitude, longitude and subtotal must be valid numbers.");
  }

  const timestamp = typeof order.timestamp === "string" && order.timestamp.trim().length > 0
    ? order.timestamp.trim()
    : formatCurrentTimestampForCsv();

  return {
    id,
    latitude,
    longitude,
    subtotal,
    timestamp
  };
}

function processOrder(order: Partial<OrderInput>) {
  const normalizedOrder = normalizeOrder(order);

  const result = {
    order_id: normalizedOrder.id,
    ...calculateOrderTaxByCoordinates(normalizedOrder)
  };

  return { normalizedOrder, result };
}

function toStoredOrder(order: NormalizedOrder, source: string): StoredOrder {
  return {
    order_id: order.id,
    longitude: order.longitude,
    latitude: order.latitude,
    timestamp: order.timestamp,
    subtotal: order.subtotal,
    source
  };
}

function parseBatchPayload(rawBody: string): BatchPayload {
  return JSON.parse(rawBody) as BatchPayload;
}

function serveStatic(reqPath: string, res: http.ServerResponse) {
  const relativePath = reqPath === "/" ? "index.html" : reqPath.slice(1);
  const safePath = path.normalize(relativePath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 500, { error: "Failed to read file" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Bad request" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/calculate") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody) as Partial<OrderInput> & { source?: string };
      const processed = processOrder(payload);
      appendOrderToInputCsv(processed.normalizedOrder);
      saveOrdersToDatabase([toStoredOrder(processed.normalizedOrder, payload.source ?? "create_order_block")]);
      sendJson(res, 200, processed.result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: getErrorMessage(error) });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/calculate-batch") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = parseBatchPayload(rawBody);
      const orders = Array.isArray(payload.orders) ? payload.orders : [];
      const source = typeof payload.source === "string" && payload.source.trim() ? payload.source : "csv_orders_block";
      const results = [];
      const ordersToSave: StoredOrder[] = [];

      for (const order of orders) {
        const processed = processOrder(order);
        appendOrderToInputCsv(processed.normalizedOrder);
        ordersToSave.push(toStoredOrder(processed.normalizedOrder, source));
        results.push(processed.result);
      }

      saveOrdersToDatabase(ordersToSave);
      sendJson(res, 200, { count: results.length, results });
      return;
    } catch (error) {
      sendJson(res, 400, { error: getErrorMessage(error) });
      return;
    }
  }

  if (req.method === "GET") {
    serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Web app is running at http://localhost:${PORT}`);
});
