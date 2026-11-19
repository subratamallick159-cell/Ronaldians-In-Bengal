import { defineConfig } from "vite";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("./server.js");

export default defineConfig({
  server: {
    port: 5173
  },
  plugins: [
    {
      name: "rfcu-backend-dev-middleware",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url === "/api" || req.url.startsWith("/api/"))) {
            return app(req, res, next);
          }
          next();
        });
      }
    }
  ]
});
