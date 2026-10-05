import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editor = path.join(root, 'frontend', 'dist')
const player = path.join(root, 'display', 'dist')
const out = path.join(root, 'backend', 'web')

if (!fs.existsSync(path.join(editor, 'index.html'))) {
  console.error('frontend/dist/index.html is missing')
  process.exit(1)
}
if (!fs.existsSync(path.join(player, 'index.html'))) {
  console.error('display/dist/index.html is missing')
  process.exit(1)
}

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(editor, path.join(out, 'editor'), { recursive: true })
fs.cpSync(player, path.join(out, 'player'), { recursive: true })
console.log('Staged editor and player into backend/web')
