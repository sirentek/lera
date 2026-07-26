#!/usr/bin/env node
// run-dev-electron.mjs — Lera fork dev launcher.
//
// WHY THIS EXISTS (Lera fork only, not upstream)
// ----------------------------------------------
// Upstream's dev:electron runs bare `electron .`, which shows the stock Electron
// icon + "Electron" taskbar name during development. This wrapper copies the
// resolved electron.exe to a branded `Lera.exe` on Windows and stamps it with
// the Lera icon/identity (via set-exe-identity.mjs) so the dev window matches a
// packed build. On non-Windows it just execs electron directly.
//
// Kept ESM (.mjs) to match the rest of scripts/ after upstream's ESM migration;
// set-exe-identity.mjs is ESM and can only be imported, not require()d.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

import { stampExeIdentity } from './set-exe-identity.mjs'

const require = createRequire(import.meta.url)
const desktopRoot = path.resolve(import.meta.dirname, '..')

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function statSignature(filePath) {
  const stat = fs.statSync(filePath)
  return {
    mtimeMs: stat.mtimeMs,
    path: filePath,
    size: stat.size
  }
}

function sameSignature(a, b) {
  return a && b && a.path === b.path && a.size === b.size && a.mtimeMs === b.mtimeMs
}

async function ensureWindowsDevElectronExe(electronExe) {
  const electronDist = path.dirname(electronExe)
  const devExe = path.join(electronDist, 'Lera.exe')
  const icon = path.join(desktopRoot, 'assets', 'icon.ico')
  const stampPath = path.join(desktopRoot, 'build', 'dev-electron-icon.json')
  const nextStamp = {
    icon: statSignature(icon),
    source: statSignature(electronExe)
  }
  const currentStamp = readJson(stampPath)

  if (fs.existsSync(devExe) && sameSignature(currentStamp?.source, nextStamp.source) && sameSignature(currentStamp?.icon, nextStamp.icon)) {
    return devExe
  }

  fs.copyFileSync(electronExe, devExe)
  await stampExeIdentity(devExe, desktopRoot)
  writeJson(stampPath, nextStamp)

  return devExe
}

async function resolveElectronExe() {
  const electronExe = require('electron')

  if (process.platform !== 'win32') {
    return electronExe
  }

  try {
    return await ensureWindowsDevElectronExe(electronExe)
  } catch (error) {
    const fallback = path.join(path.dirname(electronExe), 'Lera.exe')
    if (fs.existsSync(fallback)) {
      console.warn(`[run-dev-electron] could not refresh ${fallback} (${error.message}); using existing copy`)
      return fallback
    }

    console.warn(`[run-dev-electron] could not create branded dev executable (${error.message}); falling back to ${electronExe}`)
    return electronExe
  }
}

async function main() {
  const electronExe = await resolveElectronExe()
  const args = process.argv.slice(2)
  const child = spawn(electronExe, args.length ? args : ['.'], {
    cwd: desktopRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false
  })

  let childClosed = false
  child.on('close', (code, signal) => {
    childClosed = true
    if (code === null) {
      console.error(`${electronExe} exited with signal ${signal}`)
      process.exit(1)
    }
    process.exit(code)
  })

  const forwardSignal = signal => {
    process.on(signal, () => {
      if (!childClosed) {
        child.kill(signal)
      }
    })
  }

  forwardSignal('SIGINT')
  forwardSignal('SIGTERM')
  forwardSignal('SIGUSR2')
}

main().catch(error => {
  console.error(`[run-dev-electron] ${error.message}`)
  process.exit(1)
})
