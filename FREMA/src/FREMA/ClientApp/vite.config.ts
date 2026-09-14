import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// The ASP.NET Core host in development. Everything the SPA cannot serve itself is
// proxied there, so the browser sees a single origin and the BFF session cookie —
// which is SameSite=Strict and __Host- prefixed — is sent with every API call.
const API_HOST = process.env.API_HOST ?? "https://localhost:7233";

const proxied = {
  target: API_HOST,
  changeOrigin: false,
  // The host uses the ASP.NET Core development certificate, which is self-signed.
  secure: false,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": proxied,
      "/bff": proxied,
      "/connect": proxied,
      "/Account": proxied,
      "/signin-oidc": proxied,
      "/signout-callback-oidc": proxied,
      "/.well-known": proxied,
    },
  },

  build: {
    // Published straight into the host's web root, so `dotnet run` serves the built
    // SPA with no separate deployment step.
    outDir: "../wwwroot",
    emptyOutDir: true,
    sourcemap: true,
  },
});
