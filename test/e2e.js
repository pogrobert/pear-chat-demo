// End-to-end check with two real app instances on the real network.
// Drives the windows over the Chrome DevTools protocol and saves a screenshot
// of each P2P state to test/screenshots/.
//
//   npm run build:ui && node test/e2e.js
const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const electron = require('electron')

const root = path.join(__dirname, '..')
const shots = path.join(__dirname, 'screenshots')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pear-chat-e2e-'))
const apps = []

main()
  .then(() => console.log('\nall states verified'))
  .catch(async (err) => {
    console.error('\nFAILED:', err.message)
    process.exitCode = 1
    for (const app of apps) await app.shot('failure').catch(() => {})
  })
  .finally(() => [...apps].forEach((app) => app.quit()))

async function main() {
  fs.mkdirSync(shots, { recursive: true })

  const alice = await launch('alice', 9331)
  // the full onboarding, card by card
  await alice.see('Nothing in the middle')
  await alice.click('Continue')
  await alice.see('A room is just a key')
  await alice.click('Continue')
  await alice.see('Offline is fine')
  await alice.click('Continue')
  await alice.see('What should people call you?')
  await alice.click('Create Room')
  await alice.see('Enter a name to continue.')
  await alice.type('.ob-field input', 'Alice')
  await alice.shot('0-onboarding')
  await alice.click('Create Room')
  await alice.see('Looking for peers…')
  await alice.shot('1-finding-peers')
  await alice.see('Your Room Is Ready')
  await alice.shot('2-empty-room')
  const key = await alice.eval("localStorage.getItem('room')")

  await alice.send('Is anyone here?')
  await alice.see('Waiting for a peer')
  await alice.see('1 message will be delivered when a peer is here.')
  await alice.shot('3-message-pending')

  let bob = await launch('bob', 9332)
  await bob.click('Skip')
  await bob.type('.ob-field input', 'Bob')
  await bob.click('Join with Key…')
  await bob.type('#key', 'not a key')
  await bob.click('Join')
  await bob.see('That doesn’t look like a room key')
  await bob.shot('4-invalid-key')
  await bob.type('#key', key)
  await bob.click('Join')

  await bob.see('Is anyone here?')
  await bob.see('Connected to Alice')
  await alice.see('Connected to Bob')
  await alice.see('Bob joined')
  await alice.see('Delivered')
  await alice.gone('Waiting for a peer')
  await alice.shot('5-message-delivered')

  await bob.send('Hi Alice, I am here')
  await alice.see('Hi Alice, I am here')
  await bob.see('Delivered')
  await bob.shot('6-presence')

  bob.quit()
  await alice.see('Bob left')
  await alice.see('No one else is here')
  await alice.send('You missed this')
  await alice.send('And this')
  await alice.see('2 messages will be delivered when a peer is here.')
  await alice.shot('7-peer-left')

  // give the old worker a moment to release its storage lock
  await new Promise((resolve) => setTimeout(resolve, 3000))
  bob = await launch('bob', 9332)
  await bob.see('Up to date. 2 messages synced from peers.')
  await bob.see('And this')
  await bob.shot('8-caught-up')
  await alice.see('Connected to Bob')
  await alice.gone('Waiting for a peer')
  await alice.shot('9-delivered-after-reconnect')
}

async function launch(name, port) {
  const child = spawn(electron, ['.', '--no-updates', '--storage', path.join(tmp, name)], {
    cwd: root,
    env: { ...process.env, PEAR_CHAT_DEBUG_PORT: String(port) },
    stdio: 'ignore'
  })

  const page = await retry(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    return targets.find((target) => target.type === 'page') || Promise.reject(new Error('no page'))
  })
  const send = await connect(page.webSocketDebuggerUrl)
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true
    })
    if (exceptionDetails) throw new Error(exceptionDetails.exception.description)
    return result.value
  }
  const body = () => evaluate('document.body.innerText')

  const app = {
    quit() {
      apps.splice(apps.indexOf(app), 1)
      child.kill()
    },
    text: (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`),
    async see(text) {
      await retry(async () => {
        if (!(await body()).includes(text)) throw new Error(`${name} never showed "${text}"`)
      })
      console.log(`ok - ${name} sees "${text}"`)
    },
    async gone(text) {
      await retry(async () => {
        if ((await body()).includes(text)) throw new Error(`${name} still shows "${text}"`)
      })
      console.log(`ok - ${name} no longer sees "${text}"`)
    },
    async click(label) {
      await retry(() =>
        evaluate(`{
          const button = [...document.querySelectorAll('button')].find(
            (b) =>
              (b.innerText === ${JSON.stringify(label)} ||
                b.getAttribute('aria-label') === ${JSON.stringify(label)}) &&
              !b.disabled
          )
          if (!button) throw new Error('no enabled button "${label}"')
          button.click()
        }`)
      )
    },
    async type(selector, text) {
      await retry(() =>
        evaluate(`{
          const el = document.querySelector(${JSON.stringify(selector)})
          el.focus()
          el.select()
        }`)
      )
      await send('Input.insertText', { text })
    },
    async send(text) {
      await app.type('textarea', text)
      await app.click('Send')
    },
    eval: evaluate,
    // A capture of this app window only (by its window number), so the
    // native glass is in the picture and nothing else on screen is.
    async shot(file) {
      const id = windowId(child.pid)
      const out = path.join(shots, file + '-' + name + '.png')
      if (id) execFileSync('screencapture', ['-x', '-o', '-l', id, out])
    }
  }
  apps.push(app)
  return app
}

// The macOS window number of the app's window, looked up by process id.
function windowId(pid) {
  const script = `ObjC.import('CoreGraphics')
    const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)))
    const win = list.find((w) => w.kCGWindowOwnerPID === ${pid} && w.kCGWindowLayer === 0 && w.kCGWindowBounds.Height > 100)
    win ? String(win.kCGWindowNumber) : ''`
  return execFileSync('osascript', ['-l', 'JavaScript', '-e', script]).toString().trim()
}

// Minimal DevTools protocol client over the WebSocket built into Node.
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 1
    socket.onerror = () => reject(new Error('could not reach the app window'))
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (!pending.has(message.id)) return
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
    socket.onopen = () =>
      resolve((method, params = {}) => {
        const id = nextId++
        socket.send(JSON.stringify({ id, method, params }))
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
      })
  })
}

async function retry(fn, timeout = 30000) {
  const start = Date.now()
  while (true) {
    try {
      return await fn()
    } catch (err) {
      if (Date.now() - start > timeout) throw err
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
