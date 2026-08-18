import { getAccounts, getExpenseCategoryCatalog, getPurchaseItemCatalog } from "./src/features/finance/actions";

async function run() {
  console.log("Accounts:");
  console.dir(await getAccounts(), { depth: null });
  
  console.log("Expense Categories:");
  console.dir(await getExpenseCategoryCatalog(), { depth: null });
  
  console.log("Purchase Items:");
  console.dir(await getPurchaseItemCatalog(), { depth: null });
}

run().catch(console.error);
