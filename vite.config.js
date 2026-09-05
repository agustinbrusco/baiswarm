import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Para GitHub Pages en https://<usuario>.github.io/baiswarm/ poné base: "/baiswarm/".
// Para Netlify, Vercel o un dominio propio dejá "/".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || "/",
});
