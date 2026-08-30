# Phase 1.5 Computer Spike — Cross-Platform Validation

## Pass condition

A user can watch `https://canderhq.com` inside the spike viewport, click/type into it, give control back, and agent-browser continues operating the exact same browser session.

## Test page

`/dev/computer-spike`

## Checklist

| # | Checkpoint | Web | Mac Electron | iOS Capacitor |
|---|------------|-----|--------------|---------------|
| 1 | Next.js route creates Vercel Sandbox | pending | pending | pending |
| 2 | Sandbox boots from agent-browser snapshot | pending | pending | pending |
| 3 | Chrome opens canderhq.com | pending | pending | pending |
| 4 | Snapshot returns accessibility info | pending | pending | pending |
| 5 | Streaming starts | pending | pending | pending |
| 6 | JPEG frames reach client | pending | pending | pending |
| 7 | User mouse input works | pending | pending | pending |
| 8 | User keyboard input works | pending | pending | pending |
| 9 | Agent action on same browser after handoff | pending | pending | pending |
| 10 | Page state intact across human → agent | pending | pending | pending |

## Status

Requires Vercel Sandbox credentials. Code paths implemented; manual validation pending on credentialed environment.
