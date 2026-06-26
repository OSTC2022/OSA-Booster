import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const roots = ['lib', 'app', 'components', 'scripts']
const tables = new Set()
const re = /\.from\(['"]([\w_]+)['"]\)/g

function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(ts|tsx|mjs|js)$/.test(ent.name)) {
      const s = readFileSync(p, 'utf8')
      let m
      while ((m = re.exec(s))) tables.add(m[1])
    }
  }
}

const cwd = resolve(process.cwd())
for (const r of roots) {
  const dir = join(cwd, r)
  try {
    walk(dir)
  } catch {
    // skip missing
  }
}

console.log([...tables].sort().join('\n'))
