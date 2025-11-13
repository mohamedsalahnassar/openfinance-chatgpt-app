import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "/client/",
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_CLIENT_PORT ?? 5174),
    allowedHosts:
      process.env.VITE_ALLOWED_HOSTS === "true"
        ? true
        : process.env.VITE_ALLOWED_HOSTS?.split(",").map((host) => host.trim()).filter(Boolean) ??
          ["localhost", "127.0.0.1"]
  }
});
