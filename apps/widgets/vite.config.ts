import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const outDir = path.resolve(__dirname, "../../assets/openfinance-consent-flow");

export default defineConfig(() => ({
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: "assets"
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
}));
