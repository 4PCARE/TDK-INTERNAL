import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
  ],
  css: {
    postcss: "./postcss.config.js",
  },
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
    port: 5173,
    allowedHosts: "372605f0-45bc-4472-9833-ce8d6cb297a8-00-iumlc89wjmzm.pike.replit.dev",
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/me': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/login': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/refresh': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/roles': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    hmr: {
      port: 24678
    }
  },
  define: {
    __DEV__: process.env.NODE_ENV === "development",
  },
  optimizeDeps: {
    exclude: ['@emotion/react', '@emotion/babel-plugin']
  },
});