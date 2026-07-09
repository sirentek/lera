#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { stampExeIdentity } = require('./set-exe-identity.cjs')

const desktopRoot = path.resolve(__dirname, '..')

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
