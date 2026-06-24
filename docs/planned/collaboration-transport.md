# Collaboration transport — sync adapters

Status: planned. Companion to `collaboration-sync-protocol.md`, which defines
what is synced. This doc defines how it travels.

## The idea

The app never knows which backend it is using. It speaks to a `SyncAdapter`
interface; the adapter behind it is swapped per project. This means all tiers
share the same operation protocol and the same local SQLite store — only the
transport differs.

---

## The adapter interface

```ts
interface SyncAdapter {
  push(ops: Operation[]): void        // send local commits
  pull(since: Timestamp): Operation[] // receive remote commits
  presence(user: User): void          // announce "I'm editing this frame"
  onRemoteOps(cb: (ops: Operation[]) => void): void
}
```

Four tiers implement this interface:

---

## Tiers

### Local (solo)
No network. Operations stay in local SQLite only. The default when a project has
no sync configured. Zero cost, zero infrastructure.

### P2P via WebRTC (small teams, 2–5 people)
Operations travel peer-to-peer using **Yjs + y-webrtc**. No server touches the
design data. Requires a lightweight **signaling server** only for the initial
handshake (peers finding each other) — after that, the server is out of the loop.

- Signaling server: ~50-line open-source script, can be self-hosted or use a
  free public one.
- Works on LAN without internet (mDNS discovery).
- Limitation: all peers must be online simultaneously to receive updates.
  Offline changes sync when both peers reconnect.
- Cost to user: zero. Cost to Bruno: zero.

### Self-hosted (teams / enterprises)
The same sync server binary Bruno runs for Cloud, distributed as a Docker image.
The company runs it on their own infrastructure. Bruno sells a license; the
company controls their data entirely.

The app points to the company's server URL in project settings. From there,
behavior is identical to Cloud.

### Cloud (Bruno's servers)
Hosted by Bruno. Companies subscribe per seat. Identical server code to
self-hosted — the only difference is who runs the hardware.

---

## Switching tiers

Tier is a project-level setting, not a workspace or account setting. A project
can move from Local → Cloud → Self-hosted without data loss — the operation log
is the same format everywhere; it just gets replicated to the new backend.

```
Project settings → Sync
  ○ Local only
  ○ P2P (share invite link)
  ○ Self-hosted  [ https://design.company.com ]
  ○ Cloud        [ sign in ]
```

---

## What self-hosted companies receive

A Docker image of the sync server. Not source code. The image exposes a
WebSocket endpoint that speaks the operation protocol. The client app connects
to it; the server stores and relays commits. The company never sees app internals.

---

## Open questions (resolve when specced)

- Which CRDT library: Yjs (mature, WebRTC provider ready) vs Automerge (better
  history / time-travel story)?
- Signaling server: run one publicly for free P2P users, or rely on existing
  public servers (y-webrtc defaults)?
- Auth per tier: invite link (P2P), API key (self-hosted), account login (cloud).
- End-to-end encryption for P2P and self-hosted tiers?
