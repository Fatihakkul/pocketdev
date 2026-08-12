import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4301,
    // `npm run dev` sırasında API çağrıları bot sürecine gidiyor; derlenmiş
    // hâlde panel zaten aynı sunucudan servis edildiği için proxy devre dışı.
    proxy: {
      "/api": "http://127.0.0.1:4300",
    },
  },
});
