# AGENTS.md

## Cursor Cloud specific instructions

This is a **Node.js/TypeScript shared library** (npm package `eufy-security-client`) — not a standalone application. There are no databases, Docker containers, or backend services to run.

### Key commands

| Task | Command |
|------|---------|
| Install dependencies | `npm ci` |
| Build (TypeScript → JS) | `npm run build` |
| Run tests | `npm test` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |
| Watch mode (dev) | `npm run watch` |

### Gotchas

- **`jiti` required for ESLint**: The ESLint config uses TypeScript (`eslint.config.mts`), which requires `jiti` at runtime. It is not listed in `devDependencies`, so the update script installs it via `npm install --no-save jiti` after `npm ci`. Without it, `npm run lint` will fail with _"The 'jiti' library is required for loading TypeScript configuration files"_.
- **Pre-existing lint errors**: `npm run lint` reports ~47K indent/style errors from the existing codebase. These are pre-existing and not caused by new changes.
- **`npm ci` triggers build**: The `prepare` script in `package.json` runs `npm run build`, so `npm ci` also compiles TypeScript. A separate `npm run build` is only needed after source changes.
- **Node.js >= 20 required**: Enforced by `engines` field and `.npmrc` (`engine-strict=true`).
- **CI workflows** (in `.github/workflows/`): `build.yml` (build check), `jest.yml` (tests), `format.yml` (prettier check). There is no CI job for `npm run lint` currently.
- **"Hello world" for this library**: Import `./build/index.js` and verify key exports (`EufySecurity`, `HTTPApi`, `Device`, `Station`, etc.). Actual cloud/P2P functionality requires real Eufy credentials and hardware.
