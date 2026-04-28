# Category Management Service

A backend service for managing hierarchical product categories with unlimited nesting, a GraphQL API, and Redis caching.

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Features](#features)
3. [Project Structure](#project-structure)
4. [Quick Start with Docker](#quick-start-with-docker)
5. [Local Development Setup](#local-development-setup)
6. [Environment Variables](#environment-variables)
7. [GraphQL API](#graphql-api)
   - [Endpoint](#endpoint)
   - [Schema](#schema)
   - [Queries](#queries)
   - [Mutations](#mutations)
8. [Running Tests](#running-tests)
9. [npm Scripts](#npm-scripts)

---

## Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime |
| TypeScript | 6 | Language |
| Express.js | 5 | HTTP server |
| Apollo Server | 5 | GraphQL server |
| GraphQL | 16 | Query language |
| MongoDB | 7 | Primary database |
| Mongoose | 9 | MongoDB ODM |
| Redis | 7 | Caching layer |
| ioredis | 5 | Redis client |
| Docker + Compose | latest | Containerisation |
| Jest + ts-jest | 30 | Testing framework |

---

## Features

- **Unlimited category nesting** — categories can be nested to any depth (e.g. `Electronics > Accessories > Wearable > Smart Watch`)
- **Single parent per category** — each category has at most one parent
- **Unique category names** — enforced at the database level
- **Full ancestor chain** — every query returns the complete path from root to the category's parent
- **Cascade deactivation** — deactivating a category deactivates all its descendants automatically in a single database operation
- **Redis caching** — reads are served from cache; cache is invalidated on every write
- **GraphQL API** — full CRUD exposed via a typed GraphQL schema

---

## Project Structure

```
category-management-service/
├── src/
│   ├── config/
│   │   ├── db.ts                 MongoDB connection
│   │   └── redis.ts              Redis client
│   ├── models/
│   │   └── Category.ts           Mongoose schema (ancestors array pattern)
│   ├── cache/
│   │   └── category.cache.ts     Redis get / set / invalidate helpers
│   ├── services/
│   │   └── category.service.ts   All business logic
│   ├── graphql/
│   │   ├── typeDefs.ts           GraphQL schema (SDL)
│   │   └── resolvers.ts          Query and Mutation resolvers
│   └── server.ts                 Express + Apollo Server entry point
├── tests/
│   ├── helpers/db.ts             MongoDB memory server test utilities
│   ├── unit/
│   │   └── category.service.test.ts   30 unit tests for the service layer
│   └── integration/
│       └── graphql.test.ts            14 integration tests for the GraphQL API
├── .env.example
├── .dockerignore
├── Dockerfile                    Multi-stage build (builder + production)
├── docker-compose.yml            Full stack: app + MongoDB + Redis
├── jest.config.js
├── tsconfig.json
└── package.json
```

---

## Quick Start with Docker

This is the easiest way to run the full stack. You only need Docker and Docker Compose installed.

**Step 1 — Clone the repository**

```bash
git clone <your-repo-url>
cd category-management-service
```

**Step 2 — Create the environment file**

```bash
cp .env.example .env
```

**Step 3 — Build and start all services**

```bash
docker-compose build
docker-compose up -d
```

This starts three containers:

| Container | Service | Port |
|---|---|---|
| `category-api` | GraphQL API | `4000` |
| `category-mongo` | MongoDB 7 | `27017` |
| `category-redis` | Redis 7 | `6379` |

The app waits for both MongoDB and Redis to pass their healthchecks before starting.

**Step 4 — Open the GraphQL playground**

```
http://localhost:4000/graphql
```

**Step 5 — Check the health endpoint**

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

**Stop all services**

```bash
docker-compose down
```

---

## Local Development Setup

Use this if you want hot-reload during development without Docker.

### Prerequisites

- Node.js v20 or higher
- MongoDB 7 running locally
- Redis 7 running locally

```bash
node -v        # v20.x.x or higher
mongod --version
redis-cli ping # PONG
```

### Steps

**Step 1 — Install dependencies**

```bash
npm install
```

**Step 2 — Create the environment file**

```bash
cp .env.example .env
```

**Step 3 — Start MongoDB and Redis**

```bash
# macOS (Homebrew)
brew services start mongodb-community
brew services start redis

# Ubuntu / Debian
sudo systemctl start mongod
sudo systemctl start redis-server

# Windows
net start MongoDB
redis-server
```

**Step 4 — Start the dev server (with hot reload)**

```bash
npm run dev
```

The server starts at `http://localhost:4000/graphql`.

**Build for production**

```bash
npm run build    # compiles TypeScript → dist/
npm start        # runs dist/server.js
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the HTTP server listens on |
| `MONGODB_URI` | `mongodb://localhost:27017/categories` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_TTL` | `3600` | Cache TTL in seconds (1 hour) |
| `NODE_ENV` | `development` | `development` or `production` |

> **Note:** When running with `docker-compose`, `MONGODB_URI` and `REDIS_URL` are automatically overridden to point to the container service names (`mongo`, `redis`). You do not need to change `.env` for Docker.

`.env.example`:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/categories
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600
NODE_ENV=development
```

---

## GraphQL API

### Endpoint

```
POST http://localhost:4000/graphql
```

An interactive playground (Apollo Sandbox) is available at the same URL when opened in a browser.

---

### Schema

```graphql
type Category {
  id: ID!
  name: String!
  parent: Category           # direct parent, null if root
  ancestors: [Category!]!    # ordered list from root → direct parent
  children: [Category!]!     # immediate child categories
  isActive: Boolean!
  createdAt: String!
  updatedAt: String!
}

type Query {
  categories(isActive: Boolean): [Category!]!
  category(id: ID!): Category
  categoryByName(name: String!): Category
}

type Mutation {
  createCategory(name: String!, parentId: ID): Category!
  updateCategory(id: ID!, name: String, parentId: ID): Category!
  deactivateCategory(id: ID!): Category!
  activateCategory(id: ID!): Category!
  deleteCategory(id: ID!): Boolean!
}
```

---

### Queries

#### List all categories

```graphql
query {
  categories {
    id
    name
    isActive
    parent {
      id
      name
    }
  }
}
```

#### List only active categories

```graphql
query {
  categories(isActive: true) {
    id
    name
    parent { name }
  }
}
```

#### Get a category by ID (with full ancestor chain)

Replace `<id>` with a real MongoDB ObjectId returned from a `createCategory` or `categories` query.

```graphql
query {
  category(id: "68ee52083227920879d3b27d") {
    id
    name
    isActive
    parent {
      id
      name
    }
    ancestors {
      id
      name
    }
    children {
      id
      name
    }
  }
}
```

Example response:

```json
{
  "data": {
    "category": {
      "id": "68ee52213227920879d3b280",
      "name": "Smart Watch",
      "isActive": true,
      "parent": { "id": "68ee52213227920879d3b27f", "name": "Wearable Accessories" },
      "ancestors": [
        { "id": "68ee52083227920879d3b27d", "name": "Electronics" },
        { "id": "68ee52213227920879d3b27e", "name": "Accessories" },
        { "id": "68ee52213227920879d3b27f", "name": "Wearable Accessories" }
      ],
      "children": []
    }
  }
}
```

#### Find a category by name

```graphql
query {
  categoryByName(name: "Smart Watch") {
    id
    name
    parent { name }
    ancestors { name }
  }
}
```

---

### Mutations

#### Create a root category

```graphql
mutation {
  createCategory(name: "Electronics") {
    id
    name
    isActive
  }
}
```

#### Create a nested category

```graphql
mutation {
  createCategory(name: "Accessories", parentId: "68ee52083227920879d3b27d") {
    id
    name
    parent { name }
    ancestors { name }
  }
}
```

#### Build a 4-level hierarchy

```graphql
# Step 1 — root
mutation A { createCategory(name: "Electronics") { id } }

# Step 2
mutation B { createCategory(name: "Accessories", parentId: "<electronics_id>") { id } }

# Step 3
mutation C { createCategory(name: "Wearable Accessories", parentId: "<accessories_id>") { id } }

# Step 4
mutation D { createCategory(name: "Smart Watch", parentId: "<wearable_id>") { id } }
```

#### Update a category name

```graphql
mutation {
  updateCategory(id: "68ee52083227920879d3b27d", name: "Consumer Electronics") {
    id
    name
  }
}
```

#### Move a category to a new parent

```graphql
mutation {
  updateCategory(id: "68ee52083227920879d3b27d", parentId: "68ee52213227920879d3b27e") {
    id
    name
    ancestors { name }
  }
}
```

#### Deactivate a category (cascades to all children)

```graphql
mutation {
  deactivateCategory(id: "68ee52083227920879d3b27d") {
    id
    name
    isActive
  }
}
```

All descendant categories are also set to `isActive: false` in a single database operation.

#### Activate a category

```graphql
mutation {
  activateCategory(id: "68ee52083227920879d3b27d") {
    id
    name
    isActive
  }
}
```

> Child categories are **not** automatically re-activated. Each must be activated individually.

#### Delete a category

Only allowed when the category has no children.

```graphql
mutation {
  deleteCategory(id: "68ee52083227920879d3b27d")
}
```

#### Using curl

```bash
# Create a category
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { createCategory(name: \"Electronics\") { id name } }"}'

# List all categories
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { categories { id name isActive } }"}'
```

---

## Running Tests

Tests use an in-memory MongoDB (no external database required) and a mocked Redis client, so they run with no infrastructure dependencies.

```bash
npm test
```

Expected output:

```
Test Suites: 2 passed, 2 total
Tests:       44 passed, 44 total
Time:        ~4s
```

**Test coverage:**

| Suite | File | Tests |
|---|---|---|
| Unit | `tests/unit/category.service.test.ts` | 30 |
| Integration | `tests/integration/graphql.test.ts` | 14 |

---

## npm Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production build |
| `npm test` | Run the full test suite (44 tests) |
