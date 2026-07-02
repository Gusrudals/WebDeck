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
  URL.revokeObjectURL(url)
}
