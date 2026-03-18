# Liquibase Migration Tool PoC — Phase 1 Scaffold

This is a standalone developer tool that simplifies Liquibase database migrations for PostgreSQL.

## Project Structure

```
/client/                    # React TypeScript frontend (Vite)
  /src/
    /components/           # Reusable UI components
    /pages/                # Route-level pages
    /hooks/                # Custom React hooks
    /types/                # TypeScript type definitions
    /api/                  # API wrapper functions (fetch)
  /public/                 # Static assets
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js

/server/                    # Node.js/Express backend
  /src/
    /routes/              # Express route handlers
    /services/            # Core business logic
    /db/                  # PostgreSQL connection + queries
    /types/               # TypeScript type definitions
  index.ts
  package.json
  tsconfig.json

.env.example               # Environment variable template
CLAUDE.md                  # Project spec and technical decisions
README.md
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Visualization**: React Flow (for schema diagrams)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (via node-postgres)
- **GitHub Integration**: Octokit

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your database connections
3. Install dependencies:

```bash
npm install --workspace=server --workspace=client
```

### Development

Run both server and client in development mode:

```bash
# Terminal 1: Start backend
cd server
npm run dev

# Terminal 2: Start frontend
cd client
npm run dev
```

Frontend runs on `http://localhost:5173`  
Backend API on `http://localhost:3001`

### Build

```bash
npm run build --workspace=server
npm run build --workspace=client
```

## Phase 1 Scope

This scaffold covers Phase 1 tasks:

- Connect to a DEV PostgreSQL database
- Introspect and display full schema (tables, columns, FK relationships)
- Create/alter table UI with visual diff
- Validate changes against snapshot
- Generate Liquibase changeset XML
- Apply changes to database

## Next Steps

1. Implement database connection service
2. Build schema introspection queries
3. Create React components for schema visualization
4. Build change proposal and validation logic
5. Implement Liquibase XML generation
