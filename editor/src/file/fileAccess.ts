export interface OpenedFile {
  name: string
  text: string
  handle: FileSystemFileHandle | null
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
}

export async function openHtmlFile(): Promise<OpenedFile | null> {
  const w = window as FilePickerWindow
  if (w.showOpenFilePicker) {
    let handles: FileSystemFileHandle[]
    try {
      handles = await w.showOpenFilePicker({
        types: [{ description: 'WebDeck 문서', accept: { 'text/html': ['.html', '.htm'] } }],
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
    const handle = handles[0]
    if (!handle) return null
    const file = await handle.getFile()
    return { name: file.name, text: await file.text(), handle }
  }
  return openViaInput()
}

function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

interface WritableHandle {
  createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

/** FSA 핸들에 저장. createWritable 미지원(폴백으로 연 파일 등)이면 false */
export async function saveToHandle(handle: FileSystemFileHandle, html: string): Promise<boolean> {
  const w = handle as unknown as WritableHandle
  if (typeof w.createWritable !== 'function') return false
  const stream = await w.createWritable()
  await stream.write(html)
  await stream.close()
  return true
}

export function downloadHtml(fileName: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // 일부 브라우저는 click 직후 동기 revoke 시 다운로드가 시작되기 전에 URL이 무효화된다
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
}

export type SaveAsResult = { handle: FileSystemFileHandle; name: string } | 'cancelled' | 'unsupported'

/** 다른 이름으로 저장: 피커로 대상 파일을 고르고 즉시 쓴다 */
export async function saveAsHtmlFile(suggestedName: string, html: string): Promise<SaveAsResult> {
  const w = window as SavePickerWindow
  if (!w.showSaveFilePicker) return 'unsupported'
  let handle: FileSystemFileHandle
  try {
    handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'WebDeck 문서', accept: { 'text/html': ['.html'] } }],
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    throw e
  }
  if (!(await saveToHandle(handle, html))) return 'unsupported'
  return { handle, name: handle.name }
}

/** 파일을 data URI 문자열로 읽는다 (배경 이미지 임베딩용) */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('읽기 결과가 문자열이 아닙니다'))
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다'))
    reader.readAsDataURL(file)
  })
}
