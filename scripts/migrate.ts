import { runMigrations } from "./migrations";

const ownerUrl = process.env.DATABASE_OWNER_URL;
const appRole = process.env.APP_DB_ROLE ?? "siamsil_app";
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is not set");

runMigrations(ownerUrl, appRole)
  .then((applied) => console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
