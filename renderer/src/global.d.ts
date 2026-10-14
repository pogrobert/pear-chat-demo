// window.bridge, exposed by electron/preload.js.
interface PopupItem {
  id?: string
  label?: string
  separator?: boolean
}

interface Bridge {
  ui: { platform: string; accent: string }
  copy(text: string): Promise<void>
  confirm(options: { message: string; detail: string; confirm: string }): Promise<boolean>
  popup(items: PopupItem[]): Promise<string | null>
  emoji(): void
  setMenuState(state: {
    inRoom?: boolean
    sidebar?: boolean
    receipts?: boolean
    network?: boolean
  }): void
  onMenu(listener: (action: string) => void): () => void
  onAccent(listener: (color: string) => void): () => void
  onFocus(listener: (focused: boolean) => void): () => void
  startWorker(specifier: string): Promise<boolean>
  writeWorkerIPC(specifier: string, data: string): Promise<unknown>
  onWorkerIPC(specifier: string, listener: (data: Uint8Array) => void): () => void
  onWorkerExit(specifier: string, listener: (code: number) => void): () => void
}

interface Window {
  bridge: Bridge
}

declare module '*.css'
