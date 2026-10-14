// Everything that makes the window feel like a Mac app: Liquid Glass behind
// the sidebar, the menu bar, native context menus and dialogs, and the system
// accent color. Other platforms get an ordinary opaque window.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, systemPreferences } = require('electron')
const path = require('path')
const { isMac } = require('which-runtime')

// Apple's glass view (NSGlassEffectView) through electron-liquid-glass. It is a
// private API, so if it is missing we fall back to the public vibrancy effect.
let liquidGlass = null
if (isMac) {
  try {
    liquidGlass = require('electron-liquid-glass')
  } catch (err) {
    console.error('electron-liquid-glass unavailable:', err.message)
  }
}

const material = !isMac
  ? 'none'
  : liquidGlass && liquidGlass.isGlassSupported()
    ? 'glass'
    : 'vibrancy'

function windowOptions() {
  if (!isMac) return { backgroundColor: '#1e1e1e' }
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    // The page is transparent where the glass should show (sidebar, toolbar)
    // and paints its own opaque background everywhere else.
    ...(material === 'glass' ? { transparent: true } : { vibrancy: 'sidebar' })
  }
}

function attach(win) {
  if (material === 'glass') {
    // The glass view sits behind the web contents. Re-adding it replaces the
    // previous one, so this is safe on every reload.
    win.webContents.on('did-finish-load', () => {
      liquidGlass.addView(win.getNativeWindowHandle(), {})
    })
  }

  // Chromium shows no context menu by default; give text the standard one.
  win.webContents.on('context-menu', (evt, params) => {
    const items = params.isEditable
      ? [
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { type: 'separator' },
          { role: 'selectAll' }
        ]
      : params.selectionText
        ? [{ role: 'copy' }]
        : []
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })

  win.on('focus', () => win.webContents.send('ui:focus', true))
  win.on('blur', () => win.webContents.send('ui:focus', false))
}

function accentColor() {
  if (!isMac && process.platform !== 'win32') return '#007aff'
  return '#' + systemPreferences.getAccentColor().slice(0, 6)
}

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, data)
}

// --- menu bar: every action in the UI is also a menu command ---

let menuState = { inRoom: false, sidebar: true }

function buildMenu() {
  const send = (action) => () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('ui:menu', action)
  }
  const { inRoom, sidebar } = menuState

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Room',
      submenu: [
        { label: 'New Room', accelerator: 'CmdOrCtrl+N', click: send('new-room') },
        { label: 'Join Room…', accelerator: 'CmdOrCtrl+J', click: send('join-room') },
        { type: 'separator' },
        {
          label: 'Copy Room Key',
          accelerator: 'Shift+CmdOrCtrl+C',
          enabled: inRoom,
          click: send('copy-key')
        },
        { label: 'Remove Room…', enabled: inRoom, click: send('remove-room') },
        { type: 'separator' },
        { label: 'Change Display Name…', click: send('rename') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: sidebar ? 'Hide Sidebar' : 'Show Sidebar',
          accelerator: 'Ctrl+CmdOrCtrl+S',
          click: send('toggle-sidebar')
        },
        { type: 'separator' },
        ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Pear Documentation', click: () => shell.openExternal('https://docs.pears.com') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function setup({ version }) {
  app.setAboutPanelOptions({
    applicationName: 'Pear Chat',
    applicationVersion: version,
    credits: 'A peer-to-peer chat built to learn Pear.'
  })
  if (isMac && !app.isPackaged) {
    app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'))
  }

  buildMenu()

  ipcMain.on('ui:info', (evt) => {
    evt.returnValue = { platform: process.platform, material, accent: accentColor() }
  })

  ipcMain.on('ui:menu-state', (evt, state) => {
    menuState = { ...menuState, ...state }
    buildMenu()
  })

  // A native alert sheet attached to the window.
  ipcMain.handle('ui:confirm', async (evt, { message, detail, confirm }) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message,
      detail,
      buttons: [confirm, 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    return response === 0
  })

  // A native pop-up menu; resolves with the chosen item id, or null.
  ipcMain.handle('ui:popup', (evt, items) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    return new Promise((resolve) => {
      const menu = Menu.buildFromTemplate(
        items.map((item) =>
          item.separator
            ? { type: 'separator' }
            : { label: item.label, click: () => resolve(item.id) }
        )
      )
      // The close callback can run before the click handler, so let it lose.
      menu.popup({ window: win, callback: () => setTimeout(() => resolve(null), 100) })
    })
  })

  if (isMac) {
    systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', () => {
      broadcast('ui:accent', accentColor())
    })
  }
}

module.exports = { setup, attach, windowOptions }
