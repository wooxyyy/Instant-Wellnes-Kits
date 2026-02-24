import readline from "readline";
import { calculateOrderTaxByCoordinates, processCSV } from "./csvProcess";

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function runInteractiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("Interactive order mode. Type 'exit' to quit.");

  while (true) {
    const latitudeInput = (await askQuestion(rl, "Latitude: ")).trim();
    if (latitudeInput.toLowerCase() === "exit") break;

    const longitudeInput = (await askQuestion(rl, "Longitude: ")).trim();
    if (longitudeInput.toLowerCase() === "exit") break;

    const subtotalInput = (await askQuestion(rl, "Subtotal: ")).trim();
    if (subtotalInput.toLowerCase() === "exit") break;

    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    const subtotal = Number(subtotalInput);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(subtotal)) {
      console.log("Invalid input. Please enter numeric values.");
      continue;
    }

    const result = calculateOrderTaxByCoordinates({
      latitude,
      longitude,
      subtotal,
      timestamp: new Date().toISOString()
    });

    console.log(JSON.stringify(result, null, 2));
    console.log("");
  }

  rl.close();
}

async function main() {
  const mode = process.argv[2];

  if (mode === "--interactive" || mode === "-i") {
    await runInteractiveMode();
    return;
  }

  if (mode === "--csv") {
    const csvPath = process.argv[3] ?? "data/input.csv";
    processCSV(csvPath);
    return;
  }

  console.log("Usage:");
  console.log("  npx ts-node src/index.ts --interactive");
  console.log("  npx ts-node src/index.ts --csv data/input.csv");
}

main();
