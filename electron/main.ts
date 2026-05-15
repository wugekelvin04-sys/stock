import { app, BrowserWindow, globalShortcut, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc/index'
import { startScheduler, stopScheduler, setSchedulerTray } from './services/scheduler'

const isDev = process.env.NODE_ENV === 'development'
const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+\\'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    void win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

function toggleWindow() {
  if (!mainWindow) {
    mainWindow = createWindow()
    return
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else if (mainWindow.isVisible()) {
    mainWindow.focus()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function buildTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('$')
  tray.setToolTip('Stock Desk')
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', accelerator: TOGGLE_SHORTCUT, click: toggleWindow },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('click', toggleWindow)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    mainWindow = createWindow()
    buildTray()
    if (tray) setSchedulerTray(tray)
    void startScheduler()

    const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow)
    if (!registered) {
      console.warn(`[shortcut] failed to register ${TOGGLE_SHORTCUT}`)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  app.on('before-quit', () => { isQuitting = true; stopScheduler() })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => {
    // 不退出 — 保留后台 scheduler;用户从 Tray 或 Cmd+Q 退出
  })
}
