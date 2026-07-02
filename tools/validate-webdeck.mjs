#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { validateWebdeck } from './lib/validate.mjs'

const file = process.argv[2]
if (!file) {
  console.error('사용법: node tools/validate-webdeck.mjs <문서.html>')
  process.exit(2)
}

let html
try {
  html = readFileSync(file, 'utf8')
} catch {
  console.error(`파일을 읽을 수 없습니다: ${file}`)
  process.exit(2)
}

let result
try {
  result = validateWebdeck(html)
} catch (e) {
  console.error(`검증 중 내부 오류가 발생했습니다: ${e.message}`)
  process.exit(2)
}
const { errors, warnings } = result
for (const w of warnings) console.log(`경고: ${w}`)
for (const e of errors) console.log(`오류: ${e}`)

if (errors.length === 0) {
  console.log(`통과: ${file} (경고 ${warnings.length}건)`)
  process.exit(0)
}
console.log(`실패: ${file} — 오류 ${errors.length}건, 경고 ${warnings.length}건`)
process.exit(1)
