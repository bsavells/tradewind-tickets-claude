import path from 'path'
import fs from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Single timestamp shared by the JS bundle and version.json
const BUILD_TIME = new Date().toISOString()

/** Writes dist/version.json at build time with the shared timestamp. */
function versionPlugin(): Plugin {
  return {
    name: 'version-json',
    writeBundle() {
      fs.writeFileSync(
        path.resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ buildTime: BUILD_TIME }),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionPlugin()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
