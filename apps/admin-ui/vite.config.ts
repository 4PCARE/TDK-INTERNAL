import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ['react', 'react-dom', 'react-refresh']
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "..", "..", "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 3003,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:5000',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://0.0.0.0:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  define: {
    __DEV__: process.env.NODE_ENV === "development",
  },
  optimizeDeps: {
    exclude: ['@emotion/react', '@emotion/babel-plugin']
  },
});