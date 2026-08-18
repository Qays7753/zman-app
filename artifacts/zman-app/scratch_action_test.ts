import { getAllReportData } from "./src/features/reports/actions";

async function main() {
  try {
    const data = await getAllReportData("all");
    console.log("SUCCESS", data);
  } catch (err: any) {
    console.error("ERROR CAUSE:", err?.cause);
    console.error("FULL ERROR:", err);
  }
  process.exit(0);
}
main();
