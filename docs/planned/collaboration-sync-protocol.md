# Collaboration sync protocol — "the git"

Status: planned. When built, fold behavior into `Product.md` as `[NOW]`.

## The idea

Collaboration works like Git, not like Figma. There is no shared live canvas
with cursors — instead, changes are **committed per frame** and **propagated
asynchronously**. Two people can work simultaneously without conflict as long as
they are editing different frames. When they edit the same frame, the conflict is
visible and resolved explicitly.

This maps cleanly onto the product's core model: you always edit **one frame in
isolation**. That isolation is the natural ownership boundary for collaboration.

---

## The unit of change: a frame commit

When you **open** a frame (screen or component) you implicitly declare you are
working on it. When you **close or save** it, your changes become a **commit**:
a named snapshot of what changed inside that frame.

A commit is a list of **operations** — structured, not a text diff:

```
{ type: "set-property", elementId: "btn", property: "background", value: "#000" }
{ type: "add-element",  parentId: "header", element: { ... } }
{ type: "move-element", elementId: "logo", x: 12, y: 0 }
{ type: "remove-element", elementId: "divider" }
```

Operations are the lingua franca shared by all transport tiers (WebRTC, self-hosted,
cloud). The format never changes — only how they travel changes.

---

## Presence (lightweight)

Other collaborators see who is editing what at the frame level — not cursor
positions, but "Ana is editing Header". This is surfaced in the component tree
sidebar, not on the canvas itself (there is nothing shared to show on the canvas
when two people are in different frames).

If two people open the **same frame simultaneously**, the app signals it ("João is
also here"). It does not block either person. The conflict, if any, is resolved at
commit time.

---

## Conflict resolution

Operations on **different elements or different properties** of the same element
are merged automatically — no conflict.

Operations on **the same property of the same element** are a conflict. When this
happens on commit, the app opens a comparison using the existing **Versions
canvas**: the two states are shown side by side and the user picks which to keep
(or edits a blend of both). This reuses infrastructure that already exists.

The rule: conflicts are rare (most collaborators work in different frames), visible
when they happen, and resolved with a UI the user already knows.

---

## Local-first guarantee

Every collaborator always has a **full local copy** of the project in their SQLite
database. Sync is additive — commits are appended, never destructive. You can work
offline and sync when reconnected; your local state is never lost.

The "truth" of a project at any point is the **merge of all commits** each
collaborator has seen. There is no single authoritative server — or if there is
(cloud/self-hosted tiers), it is a convenient relay, not the owner of the data.

---

## Open questions (resolve when specced)

- Granularity of presence: frame-level only, or also component-within-frame?
- How are commits signed / attributed (user identity per tier)?
- Offline commit queue: how long can a client be offline before sync becomes
  complex?
- How does the history log (who changed what, when) surface in the UI?
