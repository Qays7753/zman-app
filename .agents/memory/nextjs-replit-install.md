---
name: Next.js / pnpm on Replit
description: How to get pnpm install working in this Replit environment (NixOS, pnpm workspace)
---

## The Problem
pnpm self-upgrade loop: `package.json` has `"packageManager": "pnpm@10.32.1"` but Replit's NixOS environment has pnpm 10.26.1 at a read-only path. Every pnpm command tries to upgrade itself to 10.32.1, fails with SIGABRT/SIGTERM (can't write to read-only NixOS store), and loops forever.

## The Fix
Add to `.npmrc`:
```
manage-package-manager-versions=false
registry=https://registry.npmjs.org
```

This disables pnpm's self-version-management. After adding these lines, `pnpm install` runs normally.

**Why:** NixOS store (`/nix/store/...`) is read-only. pnpm can't write its own upgraded binary there, so it crashes. Disabling version management makes pnpm use whatever binary is installed.

**How to apply:** Any time pnpm install hangs or loops with "Command was killed with SIGTERM/SIGABRT: pnpm add pnpm@X.Y.Z", check `.npmrc` for `manage-package-manager-versions=false`.

## Secondary note
The Replit firewall used to block Next.js 15.x tarballs from the default registry. Adding `registry=https://registry.npmjs.org` bypasses this. Both fixes now live in `.npmrc`.
