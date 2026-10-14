# Pear chat demo

A small peer-to-peer desktop chat: create a room, share its key, and talk to whoever joins. There is no server. Messages are stored on each peer's own disk and replicated directly between them.

I built this to learn [Pear](https://docs.pears.com) and Holepunch's P2P model (Hyperswarm, Hypercore, Corestore) by making the awkward parts of P2P visible in a UI: finding peers, messages that have not reached anyone yet, peers coming and going, and catching up after being away. It is a learning project, not a messenger.

Built with AI-assisted development; product and UX decisions are mine.

<!-- TODO screenshot: the room with two peers chatting (hero image) -->
<!-- TODO GIF: Bob quits, Alice sends two messages (pending), Bob returns and catches up -->

## Run it locally

Requires Node.js and npm. Tested on macOS (Apple silicon) only.

```sh
npm install
npm start
```

`npm start` builds the React UI with Vite and opens the app with over-the-air updates switched off.

### Two peers on one machine

Each instance needs its own storage directory, because a Corestore locks its directory. Open two terminals:

```sh
npm start -- --storage /tmp/pear-chat-alice
```

```sh
npm start -- --storage /tmp/pear-chat-bob
```

In the first window pick a name and choose **New Room**, then **Copy Room Key** (the toolbar button, or ⇧⌘C). In the second window choose **Join Room…** (⌘J), paste the key and **Join**.

Things to try:

| To see                 | Do this                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Finding peers          | Create a room and watch the status under the title                                             |
| Pending, then synced   | Send a message before the second peer joins, then join                                         |
| Presence               | Quit the second window (Cmd+Q) and watch the first                                             |
| Catch-up after offline | With the second window closed, send a few messages from the first, then start the second again |
| Offline                | Turn Wi-Fi off. The status changes to "Offline" and you can keep writing                       |
| Start over             | Delete the storage directory                                                                   |

### Tests

```sh
npm test
```

Runs the room logic with real Hyperswarm and Corestore peers against a local DHT (`hyperdht/testnet`), so it does not touch the public network. It covers chat, presence, pending to synced, offline catch-up, messages reaching a peer who never met their author, typing, and read receipts. It also runs the renderer's state logic (merging, delivery, receipts) as plain unit tests.

```sh
npm run build:ui && node test/e2e.js
```

Starts two real app instances with separate storage on the real network, drives them through every state below, and saves a capture of each app window to `test/screenshots/` (macOS asks once for Screen Recording permission).

## Share it with a `pear://` link

In Pear v3 a `pear://` link is how a built app is distributed and updated. `package.json#upgrade` holds this app's link.

I have not run this part end to end. The commands are from the [deployment guide](https://docs.pears.com/pear/how-to/operate-an-app/manual-deployment/deployment). The link currently in `package.json` was created with `pear touch` on my machine and nothing has been staged to it.

```sh
npm run make                       # build the .app
cd ..
pear build --package=./pear-chat-demo/package.json \
  --darwin-arm64-app ./pear-chat-demo/out/PearChatDemo-darwin-arm64/PearChatDemo.app
pear stage --dry-run <link> ./pear-chat-demo-0.1.0
pear stage <link> ./pear-chat-demo-0.1.0
pear seed <link>                   # keep this running so others can fetch it
```

Someone else then installs it with `pear install <link>` (or `npx pear-install <link>` without Pear).

## How it works

```
renderer (React)  <-- window.bridge -->  Electron main  <-- pipe -->  Bare worker
view only                                 spawns + relays              Hyperswarm, Corestore, Room
```

This is the layout of the official [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron) template. All P2P code runs in a [Bare](https://github.com/holepunchto/bare) worker started through `pear-runtime`. The renderer is a sandboxed web page that only exchanges small JSON messages with it.

| File                                | What it does                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `workers/room.js`                   | The P2P logic for one room. Start here.                                      |
| `workers/main.js`                   | Worker entry: one Corestore, one Hyperswarm, the IPC protocol                |
| `renderer/src/state/chat-state.mts` | How chat state changes for each worker event; pure, unit tested              |
| `renderer/src/state/chat.ts`        | Zustand store for the live session: worker events in, actions out            |
| `renderer/src/state/saved.ts`       | Zustand store for what this Mac remembers (name, rooms, settings), persisted |
| `renderer/src/Timeline.tsx`         | The virtualized message list                                                 |
| `renderer/src/*.tsx`                | The rest of the UI, in TypeScript                                            |
| `electron/native.js`                | The Mac-native shell: menu bar, dialogs, context menus, accent               |
| `electron/`                         | The template's shell, lightly adapted                                        |

### The renderer

- **TypeScript, strict.** The worker's events, the stores and every component's props are typed, and `npm run lint` type-checks. The types caught one real bug while converting: the new store had a `typing` field (who is typing) and a `typing()` action (I am typing) with the same name.
- **Zustand for state.** One store holds the live session the worker reports; the other holds what the Mac remembers and persists itself. Components subscribe only to the slices they use, so a new message re-renders the conversation, not the window.
- **Pure state logic.** How each worker event changes the state lives in `chat-state.mts` with no React or Electron in it. Node runs its unit tests straight from TypeScript.
- **A virtualized message list.** Only the rows on screen are in the DOM (TanStack Virtual), each measured because bubbles differ in height, and the list stays pinned to the newest message. With 2,000 messages in a room, 22 rows exist in the page.
- **Avatars from keys.** Each person's avatar is a Boring Avatars marble drawn from their key in the room, so two people called Alice still look different; rooms get one from the room key.

### Looking native on macOS

I followed Apple's Human Interface Guidelines (Materials, Sidebars, Toolbars, Typography, Color, Windows).

- **A sidebar that shows the network.** One field finds a room, or joins one when you paste a key. The room you're in shows how many people are here right now, and a bar at the bottom shows who you are and your connection: online, looking for peers, or how many peers are connected.
- **A Mac window, not a web page.** Inset traffic lights, a draggable toolbar with the room title and status, SF Pro at the 13 pt body size, the user's accent color read from System Settings and updated live, a default button that loses its color when the window is in the background, and a selected sidebar row that turns grey the same way.
- **Every action is in the menu bar** (Room > New Room ⌘N, Join Room… ⌘J, Copy Room Key ⇧⌘C, Remove Room…, View > Hide Sidebar ⌃⌘S), the standard Edit menu works in text fields, and right-click gives native context menus.
- **Onboarding.** First launch shows four short cards over the blurred app, each showing one idea with a small animation: no server in the middle, a room is a key, offline is fine, then your name and Create Room or Join with Key. Replay it from Help > Show Welcome.
- **Sheets and alerts.** Joining a room and renaming yourself happen in sheets; removing a room asks with a native alert.
- **Motion with a purpose.** New messages rise in from their side; history, room switching and keyboard actions stay instant. Curves and durations follow Emil Kowalski's animation guidance, and Reduce Motion keeps fades but drops movement.
- **Rooms are named after the people in them**, like Messages, because rooms have no names of their own.

I tried Liquid Glass first, through a native addon for Apple's private glass view. Only the sidebar could use the real material; toolbar controls would have needed CSS imitations, and those looked like flat grey pills next to the real thing. A polished standard Mac app was better than a half-glass one, so I took it out.

### How peers find each other

A room is a random 32-byte key. Peers join a Hyperswarm **topic** that is a hash of that key. Joining announces "I am on this topic" to a distributed hash table (HyperDHT) and looks up who else announced it. Hyperswarm then opens direct, encrypted connections to those peers, hole-punching through NATs where it can. The DHT only helps with introductions. No message passes through it.

The topic is a hash so that the DHT nodes storing the announcement never see the room key itself. The key is also used to encrypt the message logs.

### How data replicates

I chose one Hypercore per peer over Autobase. A Hypercore is an append-only log that only its creator can sign. Each peer appends its messages to its own log, and a room is the set of those logs.

When two peers in the same room connect, each sends a `hello` on a [Protomux](https://github.com/holepunchto/protomux) channel that shares the connection with replication. The hello carries the sender's name and every log it knows about, with how many blocks of each it holds. Each side opens any log it had not seen, and `store.replicate(connection)` syncs them. Hypercore verifies every block against the log's signed Merkle tree, so a peer can pass on someone else's log without being able to alter it. That is why a message still reaches you if its author has gone offline but another peer holds a copy.

### Why messages arrive in the order they do

Each log is strictly ordered. Across logs there is no shared order, so the UI sorts by the timestamp the author wrote, with the log key and position as a tie-break so every peer ends up with the same order. A writer never lets its own timestamps go backwards.

This is the main tradeoff of the design. A peer whose clock is wrong will sort in the wrong place, and a late message can appear above ones you have already read. Autobase fixes this by recording which messages each writer had seen and deriving one order from that.

## How each P2P state is detected and shown

**Finding peers.** After joining the topic the room waits for `discovery.flushed()` (the announcement has reached the DHT) and `swarm.flush()` (every peer found so far has been tried). Until then the status reads "Looking for peers…". If that finishes with nobody connected it becomes "No one else is here". The empty room explains what to do next: share the key if you created the room, or check the key if you joined one.

<!-- TODO screenshot: "Looking for peers…" and the empty-room state -->

**Pending vs synced.** A sent message is drawn immediately, faded, with a clock icon and "Waiting for a peer". It is marked delivered ("synced" in the code) when its position in my log is below `core.remoteContiguousLength`. Hypercore raises that value when a connected peer announces that it holds every block up to that point, and stores it on disk, so the state survives a restart. "Synced" therefore means at least one other peer reported having the message. It does not say which peer, or that everyone has it.

<!-- TODO screenshot: a pending message next to a synced one -->

**Presence.** A peer is present while the room's Protomux channel to it is open and it has sent a hello. The channel opening and closing produce the "Bob joined" and "Bob left" notices and the list in the side panel. Peers that were already there when I arrived are listed without a notice.

<!-- TODO screenshot: side panel with peers and a joined/left notice -->

**Catch-up after reconnecting.** The hello tells me how long the other peer's copy of each log is. If that is longer than what I have read, I am behind by the difference. The banner shows "Catching up… 3 of 12 messages" while replication fetches them, then "Up to date. 12 messages synced from peers." for a few seconds. Messages that arrive live never trigger it, because the comparison is only made from a hello.

<!-- TODO screenshot: the catch-up banner -->

**Typing.** While you write, the app sends a small "typing" signal on the room's Protomux channel, next to the hello. It is never stored, it is refreshed every few seconds while you type, and it expires on its own, so a peer that crashes mid-sentence never stays "typing".

**Seen.** "Delivered" means a peer's machine holds the message; "Seen by Alice" means Alice looked at it. Her app reports how far she has read each log, but only while its window is in front and scrolled to the bottom. The position is resent whenever peers reconnect and clamped to the real length of my log, since it comes from another machine. Read receipts can be turned off in the Room menu.

**Offline.** The renderer listens to the browser's `online` and `offline` events. This only detects losing the network interface. You can keep writing while offline, and messages stay pending until a peer is reachable.

## What was tricky

- **The docs had moved on.** I planned around `pear init` and `pear run --dev`. Both were removed in Pear v3, and a desktop app is now an Electron shell plus a Bare worker. I started from the official template instead.
- **"Bob left" followed by "Synced".** In the first two-instance run, messages sent just after a peer quit were still marked synced. `swarm.destroy()` un-announces from the DHT before it drops connections, and I was closing the room first, so the quitting peer said goodbye and then kept replicating for a moment. Destroying the swarm first makes presence and replication end together.
- **What counts as missed.** Comparing log lengths on every append made ordinary live messages look like catch-up. Taking the target only from the hello at connection time separates "arrived while I was away" from "arrived just now".
- **Who joined whom.** A connection is symmetric, so both sides first showed "X joined". A peer found during my own first discovery was there before me, so it is listed without a notice.
- **Peers who are never online together.** With one log per peer, I only learn about a writer if someone tells me. Peers pass on the list of logs they know, and remember it across restarts in the local core's user data.
- **An empty room and a wrong key look identical.** There is no server to say "no such room". The copy for a joined, empty room says so directly.
- **Ordering.** See above. Timestamps are the weakest part of this design.
- **Testing P2P.** The public DHT is slow and not repeatable, so the unit tests use a local testnet. The worker also resolves modules differently in a packaged build, so I checked that it boots in one (`npm run package`).

### Known limits

- Anyone with the room key can read and write. Names are not verified.
- A peer can lie in its hello about how long a log is, which would leave the catch-up banner stuck.
- The two-instance run was on one machine. I have not tested across two networks or difficult NATs.
- The updater from the template still runs in the worker, but the UI does not show or apply updates.

## Next steps

Nothing from the planned list was cut. What I would do next:

- **Autobase** for causal ordering and a real member list, with invites through `blind-pairing` as in the official chat example.
- **Per-peer delivery**: show who has a message, using each connected peer's replication state.
- **Detect a stalled DHT** as well as a missing network interface, and show reconnecting as its own state.
- **Update UI** for the template's over-the-air updates, and a complete `pear stage` / `pear seed` run.
- **Room names** that peers share, instead of naming rooms after the people in them.
- **Component tests** for the renderer, and a check with a screen reader.
