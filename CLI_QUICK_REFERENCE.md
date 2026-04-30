# CLI Quick Reference

## Setup

```powershell
# 1. Copy environment template
Copy-Item .env.example .env

# 2. Edit .env with your credentials (see CLI_SETUP.md)
# - OPENROUTER_API_KEY (from https://openrouter.ai/keys)
# - GITHUB_TOKEN (from https://github.com/settings/tokens)
# - DEV_DB_CONNECTION_STRING (your PostgreSQL)

# 3. Test setup
cd d:\Projects\liquiai
.\test-cli-setup.ps1

# 4. Build CLI (if not already built)
cd cli
npm run build
```

---

## Schema Pipeline Commands

### Add a Column (Dry Run)

```powershell
cd d:\Projects\liquiai\cli
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "add nullable settlement_date DATE column to trades table" `
  --dry-run
```

### Drop a Column (Dry Run)

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "drop column old_field from users table" `
  --dry-run
```

### Create a Table (Dry Run)

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "create new table audit_logs with id bigint primary key, event_type varchar, created_at timestamp, data jsonb" `
  --dry-run
```

### Add a Constraint (Dry Run)

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "add unique constraint on trades.external_id" `
  --dry-run
```

---

## Grid Pipeline Commands

### Create a New Grid Config (Dry Run)

```powershell
node ./dist/index.js grid `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --grid tradeGrid `
  --action new `
  --dry-run
```

### Update Existing Grid Config (Dry Run)

```powershell
node ./dist/index.js grid `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --grid tradeGrid `
  --action update `
  --dry-run
```

---

## Live PR Creation (No Dry Run)

Remove `--dry-run` flag to actually create a GitHub PR:

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "add nullable settlement_date DATE column to trades table"
```

This will:

1. Parse the natural language change
2. Generate a changeset
3. Run preflight checks
4. Create a pull request in your Liquibase repo
5. Print the PR URL

---

## Advanced Options

### Non-Interactive Mode (for CI/CD)

Use `--no-interactive` to skip prompts (useful in automation):

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "test" `
  --no-interactive `
  --dry-run
```

### Don't Group Changesets

By default, multiple changes are grouped into one changeset. To create separate changesets:

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "test" `
  --no-group-changesets
```

### Don't Group SQL Files

By default, SQL files are grouped. To create separate files:

```powershell
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "test" `
  --no-group-files
```

---

## Troubleshooting

### Build the CLI if changes were made

```powershell
cd d:\Projects\liquiai\cli
npm run build
```

### Check if env vars are set

```powershell
Write-Host "API Key: $($env:OPENROUTER_API_KEY.Substring(0, 10))..."
Write-Host "GitHub Token: $($env:GITHUB_TOKEN.Substring(0, 10))..."
Write-Host "DB Connection: $env:DEV_DB_CONNECTION_STRING"
```

### Enable debug logging

```powershell
$env:LLM_DEBUG = "true"
node ./dist/index.js schema --app trade-service --sprint sprint-42 --author kyle --change "test" --dry-run
```

### View help

```powershell
node ./dist/index.js schema --help
node ./dist/index.js grid --help
```

---

## Example Workflow

```powershell
# 1. Setup (one time)
Copy-Item .env.example .env
# Edit .env with your credentials

# 2. Test the setup
.\test-cli-setup.ps1

# 3. Make a test change (dry run first!)
cd cli
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "add nullable updated_at TIMESTAMP to products" `
  --dry-run

# 4. Review the output and changeset XML

# 5. If it looks good, create the PR (remove --dry-run)
node ./dist/index.js schema `
  --app trade-service `
  --sprint sprint-42 `
  --author kyle `
  --change "add nullable updated_at TIMESTAMP to products"

# 6. Check GitHub for the new PR
```

---

## Common Patterns

### Testing multiple changes

Each run creates one PR. To test different changes:

```powershell
node ./dist/index.js schema --app trade-service --sprint sprint-42 --author kyle --change "change 1" --dry-run
node ./dist/index.js schema --app trade-service --sprint sprint-42 --author kyle --change "change 2" --dry-run
```

### Using with environment file

If you have a local `.env` file, credentials are loaded automatically:

```powershell
# No need to set $env vars manually:
node ./dist/index.js schema --app trade-service --sprint sprint-42 --author kyle --change "test" --dry-run
```

### CI/CD Integration

In GitHub Actions or other CI, set secrets and use `--no-interactive`:

```yaml
- run: node ./dist/index.js schema --app trade-service --sprint sprint-42 --author cli --change "automated change" --no-interactive
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

For more details, see [CLI_SETUP.md](./CLI_SETUP.md)
