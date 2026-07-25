# LiquiAI

LiquiAI is a full-stack migration engineering platform for PostgreSQL teams using Liquibase. It combines:

- a React web application for schema and grid-change workflows,
- an Express API for schema analysis, change generation, review, and PR automation,
- and a CLI agent for terminal-first migration generation and pull request creation.

The platform converts developer intent (natural language or UI actions) into reviewable Liquibase changesets, validates them, and prepares GitHub pull requests with supporting SQL/CSV artifacts.

## Core Capabilities

- **Schema introspection and editing**
  - connect to local/dev PostgreSQL,
  - capture schema snapshots,
  - inspect table details and propose changes.
- **Change proposal lifecycle**
  - propose `CREATE_TABLE`, `ALTER_TABLE`, `DROP_TABLE`, `EXECUTE_SQL`, and `GRID_CONFIG` changes,
  - preview generated SQL,
  - apply/revert changes locally,
  - review and edit generated SQL before finalization.
- **Liquibase changeset generation**
  - generate XML changesets,
  - attach SQL files for execute-sql operations,
  - generate grid CSV payload files,
  - reorder/renumber and batch changesets.
- **AI-assisted workflows**
  - natural-language schema intent parsing,
  - migration review/preflight feedback,
  - grid assistant for width/header suggestions and chat guidance.
- **GitHub PR automation**
  - fetch target repo metadata (applications/sprints),
  - prepare title/description,
  - create branch + commit file set + open PR.

## Monorepo Structure

```text
/home/runner/work/liquiai/liquiai
├── client/                     # React + Vite frontend
├── server/                     # Express + TypeScript API/services
├── cli/                        # Commander-based CLI agent
├── CLI_QUICK_REFERENCE.md      # CLI command cookbook
└── test-cli-setup.ps1          # Environment/setup verification script
```

## Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind, AG Grid, React Flow
- **Backend:** Node.js, Express, TypeScript
- **Data:** PostgreSQL (`pg`)
- **GitHub integration:** `@octokit/rest`
- **AI provider integration:** OpenRouter-compatible chat completion API

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL instance(s) for development and/or local testing
- GitHub token with repository content + pull request permissions (for PR creation workflows)

## Installation

```bash
cd /home/runner/work/liquiai/liquiai
npm install
```

## Environment Configuration

Create environment files from templates:

```bash
cp /home/runner/work/liquiai/liquiai/server/.env.example /home/runner/work/liquiai/liquiai/server/.env
# optional for CLI convenience when invoked from repo root
cp /home/runner/work/liquiai/liquiai/server/.env.example /home/runner/work/liquiai/liquiai/.env
```

### Required environment variables

- `DEV_DB_CONNECTION_STRING`
- `LOCAL_DB_CONNECTION_STRING`
- `GITHUB_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `LIQUIBASE_CHANGESET_AUTHOR`
- `OPENROUTER_API_KEY` (for AI-assisted flows)

### Optional environment variables

- `PORT` (default: `3001`)
- `LLM_PROVIDER` (default: `openrouter`)
- `OPENROUTER_MODEL`
- `OPENROUTER_ENABLE_REASONING`
- `LLM_DEBUG`

## Running the Platform

### Web application + API

```bash
cd /home/runner/work/liquiai/liquiai
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

### Production build

```bash
cd /home/runner/work/liquiai/liquiai
npm run build
npm run start
```

## CLI Usage

The CLI compiles to `cli/dist/index.js` and reuses compiled server services from `server/dist`, so build the server first.

```bash
cd /home/runner/work/liquiai/liquiai
npm run build --workspace=server
npm run build --workspace=cli
```

### Schema pipeline

```bash
cd /home/runner/work/liquiai/liquiai/cli
node ./dist/index.js schema --app trade-service --sprint sprint-42 --author kyle --change "add nullable settlement_date DATE column to trades table" --dry-run
```

### Grid pipeline

```bash
cd /home/runner/work/liquiai/liquiai/cli
node ./dist/index.js grid --app trade-service --sprint sprint-42 --author kyle --grid tradeGrid --action new --dry-run
```

Remove `--dry-run` to allow PR creation.

## Web Workflow

1. Connect to database and capture snapshot (`/schema`)
2. Propose and validate changes (`/changes`)
3. Configure grid migrations (`/grids`, optional)
4. Initialize Liquibase session (`/liquibase/setup`)
5. Review generated changesets (`/liquibase/changesets`)
6. Preview file output (`/liquibase/preview`)
7. Create pull request (`/liquibase/create-pr`)

## API Surface

- `GET /api/health`
- `/api/schema/*` for connection, snapshot, table metadata, and column updates
- `/api/changes/*` for propose/list/preview/apply/revert/update SQL
- `/api/liquibase/*` for session management and changeset generation
- `/api/github/*` for application/sprint discovery and PR creation
- `/api/grid/*` for grid config operations and AI helpers

## Scripts

### Root

- `npm run dev` - run server + client in development
- `npm run build` - build server + client
- `npm run start` - start compiled server

### Server

- `npm run dev --workspace=server`
- `npm run build --workspace=server`
- `npm run lint --workspace=server`

### Client

- `npm run dev --workspace=client`
- `npm run build --workspace=client`
- `npm run lint --workspace=client`

### CLI

- `npm run build --workspace=cli`
- `npm run dev --workspace=cli`

## Security Notes

- Keep all tokens/keys in `.env` files and secret stores; never commit real credentials.
- Use least-privilege GitHub tokens for PR automation.
- Do not log or print full secrets in terminal output or CI logs.

## License

MIT
