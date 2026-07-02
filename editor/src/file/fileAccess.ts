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
