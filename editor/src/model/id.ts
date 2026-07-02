export function createIdGen(prefix = 'wd'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}
