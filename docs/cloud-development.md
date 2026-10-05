# BrickCircle cloud development

The workspace uses Node 22 and OpenCode 2.0.20. OpenCode is the primary coding tool; Codex handles architecture, review, and difficult fixes. Full browser regression tests run in GitHub Actions.

## Create a workspace

Check your GitHub Codespaces included usage and spending controls before creation. Use the smallest machine and a short idle timeout:

```powershell
gh codespace create --repo easwarkumarvb/brickcircle.club --branch dev/cloud-workspace --machine basicLinux32gb --location SouthEastAsia --display-name brickcircle-cloud --idle-timeout 10m
```

The post-create script installs repository dependencies and OpenCode, then checks types and release assets. It does not install browser binaries or start a preview server automatically.

## Connect and work

Open the workspace from https://github.com/codespaces or connect from a terminal:

```powershell
gh codespace ssh --codespace WORKSPACE_NAME
```

Inside the cloud terminal:

```bash
cd /workspaces/brickcircle.club
opencode
```

Connect the selected model provider using `/connect` in OpenCode. Provider credentials belong in the workspace's private credential store or Codespaces secrets, never in tracked files. Model billing and rate limits are separate from Codespaces usage.

Use a feature branch for product changes. Keep the forwarded preview port private. For a deterministic preview with the browser Supabase mock, run:

```bash
node scripts/serve-isolated.mjs 4173
```

Open `/v2.html?isolated=matched#home` through the private forwarded port. The mock preview is for development; it does not verify the hosted database.

## Checks

```bash
npm run typecheck
npm run release:check
```

For a focused browser check, install Chromium only and run one worker:

```bash
npx playwright install --with-deps chromium
npx playwright test --config=playwright.isolated.config.ts --project=chromium --workers=1 tests/isolated/messaging-polish.spec.ts
```

Stop any manually started loopback server before running tests, because the isolated config starts its own server. Push reviewed changes to a feature branch so GitHub Actions can run the full browser gate.

## Stop the workspace

Commit and push work before deleting a workspace. Stop the workspace explicitly after a session:

```powershell
gh codespace stop --codespace WORKSPACE_NAME
```

A running terminal or server can keep resetting the idle timeout. Stopped workspaces still use storage quota; delete unused workspaces only after their work is saved to GitHub. Creating this development workspace does not authorize production deployments or database writes.
