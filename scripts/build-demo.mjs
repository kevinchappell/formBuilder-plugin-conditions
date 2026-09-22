// Assembles the GitHub Pages demo into ./site from the built bundle and examples/basic.html.
// Run `npm run build:demo`; the Pages workflow uploads ./site as the deployment artifact.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const site = resolve(root, 'site')

rmSync(site, { recursive: true, force: true })
mkdirSync(site, { recursive: true })
cpSync(resolve(root, 'dist'), resolve(site, 'dist'), { recursive: true })
mkdirSync(resolve(site, 'examples'), { recursive: true })

const example = readFileSync(resolve(root, 'examples/basic.html'), 'utf8')
if (!example.includes('src="../dist/')) {
  throw new Error('examples/basic.html no longer references ../dist/; update scripts/build-demo.mjs')
}
// The example lives one directory below dist/; the demo home page sits beside it.
writeFileSync(resolve(site, 'index.html'), example.replaceAll('src="../dist/', 'src="dist/'))
writeFileSync(resolve(site, 'examples/basic.html'), example)
writeFileSync(resolve(site, '.nojekyll'), '')

console.log(`Demo assembled in ${site}`)
