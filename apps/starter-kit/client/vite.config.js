import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "/client/",
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_CLIENT_PORT ?? 5174)
  }
});
