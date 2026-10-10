import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The app imports ../src/configSchema.ts and ../supabase/; the dev server
  // refuses files outside web/ unless allowed.
  server: { fs: { allow: [".."] } },
});
