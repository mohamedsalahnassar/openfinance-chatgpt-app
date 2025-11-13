import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath =
  process.env.DOTENV_PATH ?? path.resolve(__dirname, ".env");

const result = dotenv.config({ path: envPath });

if (result.error) {
  dotenv.config();
}
