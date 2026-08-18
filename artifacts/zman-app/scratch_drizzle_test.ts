import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cashMovement } from "./src/lib/db/schema";
import { sum, count, desc, and, eq, sql } from "drizzle-orm";

const client = postgres('postgresql://postgres.dnxnyorkzgxfiqrqsjae:b-Lc_5a9Sfi%26%3FNj@aws-1-eu-central-1.pooler.supabase.com:6543/postgres', { prepare: false });
const db = drizzle(client);

async function main() {
  try {
    const res = await db
        .select({
          sourceType: cashMovement.sourceType,
          total: sum(cashMovement.amountCents),
          count: count(cashMovement.id),
        })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.direction, "in"),
            sql`${cashMovement.sourceType} in ('sale', 'deposit')`
          )
        )
        .groupBy(cashMovement.sourceType)
        .orderBy(desc(sql`sum(${cashMovement.amountCents})`));
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("QUERY ERROR:", err);
  }
  process.exit(0);
}
main();
