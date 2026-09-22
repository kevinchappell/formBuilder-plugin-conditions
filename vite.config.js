import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.js'),
      name: 'FormBuilderConditions',
      formats: ['es', 'umd'],
      fileName: format => format === 'es' ? 'formbuilder-plugin-conditions.js' : 'formbuilder-plugin-conditions.umd.js',
    },
    rollupOptions: {
      external: ['jquery'],
      output: { globals: { jquery: 'jQuery' } },
    },
  },
})
