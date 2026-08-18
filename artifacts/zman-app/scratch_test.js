const postgres = require('postgres');

const sql = postgres('postgresql://postgres.dnxnyorkzgxfiqrqsjae:b-Lc_5a9Sfi%26%3FNj@aws-1-eu-central-1.pooler.supabase.com:6543/postgres', { prepare: false });

async function main() {
  try {
    const res = await sql`select "source_type", sum("amount_cents"), count("id") from "cash_movement" where ("cash_movement"."deleted_at" is null and "cash_movement"."direction" = 'in' and "cash_movement"."source_type" in ('sale', 'deposit')) group by "cash_movement"."source_type" order by sum("cash_movement"."amount_cents") desc`;
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("QUERY ERROR:", err);
  }
  process.exit(0);
}
main();
