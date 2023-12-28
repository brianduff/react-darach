import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
    }),
    dts({ rollupTypes: true })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      name: "library",
      fileName: "library"
    },
    rollupOptions: {
      external: ["react", "react-dom", "@blueprintjs/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "React-dom",
          "@blueprintjs/core": "Blueprintjs-core"
        }
      }
    }
  }
});
