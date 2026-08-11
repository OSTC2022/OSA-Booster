/**
 * Scan tracked files for accidental Garmin / Supabase secrets.
 * Exits 1 if high-risk patterns look like real values in git-tracked paths.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const TRACKED = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

const DENY_PATHS = [/^\.env$/, /\.env\.local$/, /garmin_tokens\.json$/, /data\/tokens\//]

let failed = false

for (const path of TRACKED) {
  if (DENY_PATHS.some((re) => re.test(path.replace(/\\/g, '/')))) {
    console.error('FAIL tracked secret path:', path)
    failed = true
  }
}

const riskPatterns = [
  { name: 'supabase_service_role_jwt', re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: 'garmin_password_assignment', re: /GARMIN_PASSWORD\s*=\s*['"][^'"]{4,}['"]/ },
  { name: 'encryption_key_assignment', re: /GARMIN_TOKEN_ENCRYPTION_KEY\s*=\s*['"][^'"]{8,}['"]/ },
]

const allowPath = (p) =>
  p.endsWith('.example') ||
  p.includes('test_') ||
  p.includes('/tests/') ||
  p.endsWith('OPS.md') ||
  p.endsWith('README.md')

for (const path of TRACKED) {
  if (allowPath(path)) continue
  if (!/\.(ts|tsx|js|mjs|py|sql|md|json|yml|yaml|env)$/i.test(path)) continue
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    continue
  }
  for (const { name, re } of riskPatterns) {
    if (re.test(text)) {
      console.error(`FAIL ${name} in ${path}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('Secret scan: FAIL')
  process.exit(1)
}
console.log('Secret scan: PASS (no tracked high-risk secret patterns)')
