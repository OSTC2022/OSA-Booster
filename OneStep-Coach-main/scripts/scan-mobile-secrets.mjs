/**
 * Ensure mobile/ never ships service_role or Garmin encryption secrets.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT =
  process.cwd().endsWith('mobile') || process.cwd().endsWith('mobile\\') || process.cwd().endsWith('mobile/')
    ? process.cwd()
    : join(process.cwd(), 'mobile')
const DENY = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /service_role/,
  /GARMIN_TOKEN_ENCRYPTION_KEY/,
  /GARMIN_PASSWORD\s*=/,
]

const SKIP = new Set(['node_modules', '.expo', 'dist', 'android', 'ios'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|json|md|env)$/i.test(name) || name === '.env.example') {
      out.push(p)
    }
  }
  return out
}

let failed = false
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  for (const re of DENY) {
    if (!re.test(text)) continue
    // Documentation / guards that forbid secrets are allowed
    if (
      /never|금지|No |절대|must not|Never put|잘못된 공개/i.test(text) &&
      /SERVICE_ROLE|service_role|GARMIN_TOKEN_ENCRYPTION|GARMIN_PASSWORD/i.test(text)
    ) {
      continue
    }
    // Actual assignment of secrets
    if (/=/.test(text) && /SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(text)) {
      console.error('FAIL', re, rel)
      failed = true
      continue
    }
    if (re.source.includes('SERVICE_ROLE_KEY') || re.source.includes('GARMIN_TOKEN') || re.source.includes('GARMIN_PASSWORD')) {
      console.error('FAIL', re, rel)
      failed = true
    }
  }
}

if (failed) {
  console.error('mobile secret scan: FAIL')
  process.exit(1)
}
console.log('mobile secret scan: PASS')
