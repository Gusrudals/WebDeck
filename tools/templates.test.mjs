import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateWebdeck } from './lib/validate.mjs'

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url))

test('모든 템플릿이 포맷 검증을 통과한다 (오류·경고 0건)', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.html'))
  assert.ok(files.length >= 1, 'templates/에 .html 템플릿이 없습니다')
  for (const f of files) {
    const { errors, warnings } = validateWebdeck(readFileSync(join(TEMPLATES_DIR, f), 'utf8'))
    assert.deepEqual(errors, [], `${f} 오류: ${errors.join(' / ')}`)
    assert.deepEqual(warnings, [], `${f} 경고: ${warnings.join(' / ')}`)
  }
})
