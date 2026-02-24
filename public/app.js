function pretty(el, data) {
  el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function formatCurrentTimestampForCsv() {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");

  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(
    now.getHours()
  )}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}.${pad3(now.getMilliseconds())}000000`;
}

function formatNumberForCsv(value) {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function toCsvLine(order) {
  return `${order.id},${formatNumberForCsv(order.longitude)},${formatNumberForCsv(order.latitude)},${
    order.timestamp
  },${formatNumberForCsv(order.subtotal)}`;
}

function parseRequiredNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const singleForm = document.getElementById("single-order-form");
const placeValue = document.getElementById("place-value");
const taxValue = document.getElementById("tax-value");
const totalValue = document.getElementById("total-value");
const timestampValue = document.getElementById("timestamp-value");

const csvOrderForm = document.getElementById("csv-order-form");
const processCsvBtn = document.getElementById("process-csv-btn");
const clearCsvBtn = document.getElementById("clear-csv-btn");
const csvLinesPreview = document.getElementById("csv-lines-preview");
const csvResult = document.getElementById("csv-result");

const csvBatchOrders = [];

function setSingleResult(payload) {
  const county = payload?.jurisdictions?.county;
  const city = payload?.jurisdictions?.city;
  const state = payload?.jurisdictions?.state;

  const place = [city, county, state].filter(Boolean).join(", ");
  placeValue.textContent = place || "Location is not available (check coordinates).";
  taxValue.textContent =
    typeof payload?.tax_amount === "number" ? `$${payload.tax_amount.toFixed(2)}` : "N/A";
  totalValue.textContent =
    typeof payload?.total_amount === "number" ? `$${payload.total_amount.toFixed(2)}` : "N/A";
  timestampValue.textContent = payload?.timestamp || "N/A";
}

function setSingleError(message) {
  placeValue.textContent = message;
  taxValue.textContent = "N/A";
  totalValue.textContent = "N/A";
  timestampValue.textContent = "N/A";
}

function renderBatchPreview() {
  if (csvBatchOrders.length === 0) {
    pretty(csvLinesPreview, "No batch orders yet.");
    return;
  }

  pretty(csvLinesPreview, csvBatchOrders.map((order) => toCsvLine(order)).join("\n"));
}

singleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(singleForm);
  const id = String(formData.get("id") ?? "").trim();
  const timestamp = String(formData.get("timestamp") ?? "").trim();
  const latitude = parseRequiredNumber(formData.get("latitude"));
  const longitude = parseRequiredNumber(formData.get("longitude"));
  const subtotal = parseRequiredNumber(formData.get("subtotal"));

  if (!id) {
    setSingleError("Error: Order ID is required.");
    return;
  }

  if (latitude == null || longitude == null || subtotal == null) {
    setSingleError("Error: Latitude, longitude and subtotal must be valid numbers.");
    return;
  }

  const payload = {
    id,
    latitude,
    longitude,
    subtotal,
    timestamp: timestamp || undefined,
    source: "create_order_block"
  };

  try {
    setSingleError("Calculating...");
    const result = await postJson("/api/calculate", payload);
    setSingleResult(result);
  } catch (error) {
    setSingleError(`Error: ${getErrorMessage(error)}`);
  }
});

csvOrderForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(csvOrderForm);
  const id = String(formData.get("id") ?? "").trim();
  const longitude = parseRequiredNumber(formData.get("longitude"));
  const latitude = parseRequiredNumber(formData.get("latitude"));
  const subtotal = parseRequiredNumber(formData.get("subtotal"));
  const timestampRaw = String(formData.get("timestamp") ?? "").trim();

  if (!id) {
    pretty(csvResult, "Error: Order ID is required.");
    return;
  }

  if (longitude == null || latitude == null || subtotal == null) {
    pretty(csvResult, "Error: Longitude, latitude and subtotal must be valid numbers.");
    return;
  }

  csvBatchOrders.push({
    id,
    longitude,
    latitude,
    timestamp: timestampRaw || formatCurrentTimestampForCsv(),
    subtotal
  });

  renderBatchPreview();
  csvOrderForm.reset();
  pretty(csvResult, "Order added to batch.");
});

processCsvBtn.addEventListener("click", async () => {
  if (csvBatchOrders.length === 0) {
    pretty(csvResult, "Batch is empty. Add at least one order.");
    return;
  }

  try {
    pretty(csvResult, "Processing...");
    const result = await postJson("/api/calculate-batch", {
      source: "csv_orders_block",
      orders: csvBatchOrders
    });
    pretty(csvResult, result);
  } catch (error) {
    pretty(csvResult, `Error: ${getErrorMessage(error)}`);
  }
});

clearCsvBtn.addEventListener("click", () => {
  csvBatchOrders.length = 0;
  renderBatchPreview();
  pretty(csvResult, "Batch cleared.");
});

renderBatchPreview();
