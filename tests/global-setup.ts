import { runMigrations } from "../scripts/migrations";
import { TEST_APP_ROLE, TEST_OWNER_URL } from "./config";

export default async function setup() {
  await runMigrations(TEST_OWNER_URL, TEST_APP_ROLE);
}
