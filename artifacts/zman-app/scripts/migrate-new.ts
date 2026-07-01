import postgres from "postgres";
import fs from "fs";
import path from "path";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable is missing!");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { prepare: false });
  const migrationsDir = path.join(__dirname, "../drizzle/migrations");
  
  const files = [
    "0005_finance_catalogs.sql",
    "0006_order_dates.sql",
    "0007_message_template.sql",
    "0008_order_alt_phone.sql"
  ];

  for (const file of files) {
    console.log(`Running migration: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const statements = content.split("--> statement-breakpoint");
    
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await sql.unsafe(stmt);
        } catch (err: any) {
          // If column already exists or table exists, print warning and continue if it's safe
          if (err.message.includes("already exists")) {
            console.warn(`Warning in statement: ${err.message}`);
          } else {
            console.error(`Error in statement:`, stmt);
            console.error(err);
            await sql.end();
            process.exit(1);
          }
        }
      }
    }
    console.log(`Successfully completed migration: ${file}`);
  }

  console.log("All migrations executed successfully!");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
