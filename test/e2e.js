// End-to-end check with two real app instances on the real network.
// Drives the windows over the Chrome DevTools protocol and saves a screenshot
// of each P2P state to test/screenshots/.
//
//   npm run build:ui && node test/e2e.js
const { spawn } = require('child_process')
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
  const key = await alice.eval("JSON.parse(localStorage.getItem('pear-chat')).state.lastRoom")

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
  await alice.see('Seen by Bob')
  await alice.gone('Waiting for a peer')
  await alice.shot('5-message-seen')

  await bob.type('textarea', 'Hi Alice, I am')
  await alice.has('.typing-bubble[aria-label="Bob is typing"]')
  await alice.shot('6-typing')
  await bob.type('textarea', 'Hi Alice, I am here')
  await bob.click('Send')
  await alice.see('Hi Alice, I am here')
  await alice.hasNot('.typing-bubble')
  await bob.see('Seen by Alice')
  await alice.see('2 here')
  // A one-to-one room shows the other person's avatar, drawn from their key:
  // Bob's "Alice" row looks exactly like Alice's own avatar in her window.
  const svg = (selector) =>
    `document.querySelector('${selector} svg').outerHTML.replace(/(id|mask|filter|width|height)="[^"]*"|url\\(#[^)]*\\)/g, '')`
  await retry(async () => {
    const own = await alice.eval(svg('.me-bar .avatar'))
    const seenByBob = await bob.eval(svg('.room-row .avatar'))
    if (own !== seenByBob) throw new Error("Bob's room row does not show Alice's avatar")
  })
  console.log("ok - bob's room row shows Alice's avatar")
  await alice.has('.me-bar .dot.on')
  await bob.shot('6-presence')

  // The Network panel shows the live connection and both logs.
  await alice.click('Show network')
  await alice.see('Room topic')
  await alice.see('Same network')
  await alice.see('signed log')
  await alice.see('all with a peer')
  await alice.shot('6b-network')
  await alice.click('Hide network')

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

  // A third person joins by pasting the key into the sidebar's search field.
  const carol = await launch('carol', 9333)
  await carol.click('Skip')
  await carol.type('.ob-field input', 'Carol')
  await carol.click('Join with Key…')
  await carol.click('Cancel')
  await carol.type('.find input', key)
  await carol.click('Join room with this key')
  await carol.see('Is anyone here?')
  await carol.see('3 here')
  await alice.see('3 here')
  await carol.shot('10-sidebar-join')
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
  // Both windows count as in front, so read receipts behave as if a person
  // were looking at each of them.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
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
    async has(selector) {
      await retry(async () => {
        if (!(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))) {
          throw new Error(`${name} never showed ${selector}`)
        }
      })
      console.log(`ok - ${name} shows ${selector}`)
    },
    async hasNot(selector) {
      await retry(async () => {
        if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) {
          throw new Error(`${name} still shows ${selector}`)
        }
      })
      console.log(`ok - ${name} no longer shows ${selector}`)
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
    // The window is opaque (no glass or vibrancy), so the page's own
    // screenshot is exactly what is on screen, and works while the display
    // sleeps.
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(shots, file + '-' + name + '.png'), Buffer.from(data, 'base64'))
    }
  }
  apps.push(app)
  return app
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
