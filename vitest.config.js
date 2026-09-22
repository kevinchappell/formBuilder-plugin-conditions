import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const languageFile = resolve(import.meta.dirname, '../formBuilder/node_modules/formbuilder-languages/en-US.lang')
const FB_EN_US = Object.fromEntries(
  readFileSync(languageFile, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }),
)

export default defineConfig({
  define: {
    FB_EN_US: JSON.stringify(FB_EN_US),
  },
  resolve: {
    alias: [
      { find: /.*\.(css|less|sass|scss)(\?.*)?$/, replacement: resolve(import.meta.dirname, 'tests/style.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
})
