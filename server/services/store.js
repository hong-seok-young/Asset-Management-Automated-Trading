import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function readJSON(name, fallback) {
  ensureDir()
  const file = path.join(DATA_DIR, name)
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJSON(name, data) {
  ensureDir()
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2))
  return data
}
