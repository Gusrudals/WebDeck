import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDoc } from './lib/test-helpers.mjs'

const CLI = fileURLToPath(new URL('./validate-webdeck.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'webdeck-'))

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

test('유효한 문서는 종료 코드 0과 "통과" 출력', () => {
  const file = join(dir, 'valid.html')
  writeFileSync(file, makeDoc())
  const { code, out } = run([file])
  assert.equal(code, 0)
  assert.ok(out.includes('통과'))
})

test('오류가 있는 문서는 종료 코드 1과 오류 목록 출력', () => {
  const file = join(dir, 'invalid.html')
  writeFileSync(file, makeDoc({ version: null }))
  const { code, out } = run([file])
  assert.equal(code, 1)
  assert.ok(out.includes('오류:'))
  assert.ok(out.includes('실패'))
})

test('인자가 없으면 종료 코드 2와 사용법 출력', () => {
  const { code, out } = run([])
  assert.equal(code, 2)
  assert.ok(out.includes('사용법'))
})

test('없는 파일은 종료 코드 2', () => {
  const { code, out } = run([join(dir, 'no-such-file.html')])
  assert.equal(code, 2)
  assert.ok(out.includes('읽을 수 없습니다'))
})
