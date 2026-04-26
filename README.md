# Category Management Service

A backend service for managing hierarchical categories with unlimited nesting depth. Built with Node.js, TypeScript, MongoDB, GraphQL, and Redis.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Running the Service](#running-the-service)
  - [Local Development](#local-development)
  - [Using Docker Compose](#using-docker-compose)
- [GraphQL API](#graphql-api)
  - [Queries](#queries)
  - [Mutations](#mutations)
  - [Example Operations](#example-operations)
- [Data Model](#data-model)
- [Caching Strategy](#caching-strategy)
- [Category Deactivation Behavior](#category-deactivation-behavior)

---

## Features

- **Unlimited nesting** — categories can have unlimited levels of child categories (e.g. `Electronics > Accessories > Wearable > Smart Watch`)
- **Single parent constraint** — each category has at most one parent
- **Unique names** — all category names are globally unique
- **Full ancestry in responses** — every query returns the full ancestor chain (parent → grandparent → ... → root)
- **Cascade deactivation** — deactivating a category automatically deactivates all descendant categories
- **Redis caching** — frequently queried categories are served from cache; cache is invalidated on any write
- **GraphQL API** — full CRUD via a typed GraphQL schema

---

## Tech Stack

| Layer        | Technology              |
|--------------|-------------------------|
| Runtime      | Node.js 20+             |
| Language     | TypeScript 5            |
| Framework    | Express.js 5            |
| API          | GraphQL (Apollo Server) |
| Database     | MongoDB 7 (Mongoose)    |
| Cache        | Redis 7                 |
| Process mgr  | ts-node-dev (dev)       |

---

## Prerequisites

Make sure the following are installed on your machine:

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://www.npmjs.com/) v10 or higher
- [MongoDB](https://www.mongodb.com/try/download/community) v7 (local) **or** a MongoDB Atlas connection string
- [Redis](https://redis.io/download/) v7 (local) **or** a Redis Cloud URL
- [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/) _(optional, for containerised setup)_

Verify your versions:

```bash
node -v      # v20.x.x
npm -v       # 10.x.x
mongod --version
redis-server --version
docker --version
```

---

## Project Structure

```
category-management-service/
├── src/
│   ├── config/
│   │   ├── db.ts              # MongoDB connection
│   │   └── redis.ts           # Redis client
│   ├── models/
│   │   └── Category.ts        # Mongoose schema & model
│   ├── graphql/
│   │   ├── schema.ts          # Type definitions (SDL)
│   │   ├── resolvers/
│   │   │   ├── query.ts       # Query resolvers
│   │   │   └── mutation.ts    # Mutation resolvers
│   │   └── index.ts           # Apollo Server setup
│   ├── services/
│   │   └── category.service.ts  # Business logic
│   ├── cache/
│   │   └── category.cache.ts  # Redis cache helpers
│   └── server.ts              # Express + Apollo entry point
├── .env.example
├── .gitignore
├── docker-compose.yml
├── tsconfig.json
├── package.json
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable          | Default                          | Description                              |
|-------------------|----------------------------------|------------------------------------------|
| `PORT`            | `4000`                           | HTTP port the server listens on          |
| `MONGODB_URI`     | `mongodb://localhost:27017/categories` | MongoDB connection string           |
| `REDIS_URL`       | `redis://localhost:6379`         | Redis connection URL                     |
| `REDIS_TTL`       | `3600`                           | Cache TTL in seconds (default 1 hour)    |
| `NODE_ENV`        | `development`                    | `development` or `production`            |

`.env.example`:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/categories
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600
NODE_ENV=development
```

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd category-management-service
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and Redis URL
```

---

## Running the Service

### Local Development

Requires MongoDB and Redis running locally (see Prerequisites).

**Start MongoDB** (if running locally):

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

**Start Redis** (if running locally):

```bash
# macOS (Homebrew)
brew services start redis

# Ubuntu/Debian
sudo systemctl start redis-server

# Windows
redis-server
```

**Start the dev server** (with hot reload):

```bash
npm run dev
```

**Build and run for production**:

```bash
npm run build
npm start
```

The GraphQL playground will be available at:

```
http://localhost:4000/graphql
```

---

### Using Docker Compose

The easiest way to run the full stack (app + MongoDB + Redis) without installing anything locally.

#### Step 1 — Copy environment file

```bash
cp .env.example .env
```

#### Step 2 — Build and start all services

```bash
docker-compose up --build
```

This starts three containers:
- `category-api` — the GraphQL API on port `4000`
- `category-mongo` — MongoDB 7 on port `27017` (persisted in `mongo-data` volume)
- `category-redis` — Redis 7 on port `6379` (persisted in `redis-data` volume)

The app container waits for MongoDB and Redis to pass their healthchecks before starting.

#### Step 3 — Verify it's running

```bash
curl http://localhost:4000/graphql
# Should return the Apollo GraphQL landing page
```

#### Step 4 — Run in the background (detached mode)

```bash
docker-compose up --build -d
docker-compose logs -f app   # tail app logs
```

#### Step 5 — Stop all services

```bash
docker-compose down
```

To also remove volumes (wipes all database data):

```bash
docker-compose down -v
```

---

## GraphQL API

Access the interactive GraphQL playground at `http://localhost:4000/graphql`.

### Queries

| Operation          | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `categories`       | List all categories (paginated, filterable by `isActive`)      |
| `category(id)`     | Get a single category by ID, includes full ancestor chain      |
| `categoryByName`   | Find a category by exact name, includes full ancestor chain    |

### Mutations

| Operation            | Description                                                  |
|----------------------|--------------------------------------------------------------|
| `createCategory`     | Create a new category (optionally under a parent)            |
| `updateCategory`     | Update name or parent of an existing category                |
| `deactivateCategory` | Deactivate a category and all its descendants recursively    |
| `activateCategory`   | Re-activate a specific category (children stay deactivated)  |
| `deleteCategory`     | Hard-delete a category (only if it has no children)          |

### Example Operations

#### Create a root category

```graphql
mutation {
  createCategory(input: { name: "Electronics" }) {
    id
    name
    isActive
  }
}
```

#### Create a nested category

```graphql
mutation {
  createCategory(input: {
    name: "Accessories"
    parentId: "<Electronics_id>"
  }) {
    id
    name
    parent {
      id
      name
    }
  }
}
```

#### Get a category with its full ancestor path

```graphql
query {
  category(id: "<Smart_Watch_id>") {
    id
    name
    isActive
    ancestors {
      id
      name
    }
    parent {
      id
      name
    }
  }
}
```

Response:

```json
{
  "data": {
    "category": {
      "id": "...",
      "name": "Smart Watch",
      "isActive": true,
      "ancestors": [
        { "id": "...", "name": "Electronics" },
        { "id": "...", "name": "Accessories" },
        { "id": "...", "name": "Wearable Accessories" }
      ],
      "parent": {
        "id": "...",
        "name": "Wearable Accessories"
      }
    }
  }
}
```

#### List all active categories

```graphql
query {
  categories(filter: { isActive: true }) {
    id
    name
    parent {
      id
      name
    }
    isActive
  }
}
```

#### Deactivate a category (cascades to all children)

```graphql
mutation {
  deactivateCategory(id: "<Electronics_id>") {
    id
    name
    isActive
    # All child categories are now also inactive
  }
}
```

---

## Data Model

Each category document in MongoDB:

```ts
{
  _id:        ObjectId,       // auto-generated
  name:       string,         // unique, required
  parent:     ObjectId | null, // reference to parent Category, null = root
  ancestors:  ObjectId[],     // ordered list from root → direct parent
  isActive:   boolean,        // default: true
  createdAt:  Date,
  updatedAt:  Date
}
```

**`ancestors` array** stores the full path from the root to the direct parent. This enables:
- O(1) ancestor lookup (no recursive DB queries)
- Efficient subtree queries: `{ ancestors: categoryId }` finds all descendants

Example for `Smart Watch` under `Electronics > Accessories > Wearable Accessories`:

```json
{
  "name": "Smart Watch",
  "parent": "<Wearable_Accessories_id>",
  "ancestors": [
    "<Electronics_id>",
    "<Accessories_id>",
    "<Wearable_Accessories_id>"
  ]
}
```

---

## Caching Strategy

Redis is used to cache category reads and reduce MongoDB load.

| Cache Key Pattern              | Content                            | Invalidated when              |
|--------------------------------|------------------------------------|-------------------------------|
| `category:<id>`                | Single category document           | That category is updated      |
| `categories:all`               | Full category list                 | Any category is created/updated/deleted |
| `category:name:<name>`         | Lookup by name                     | That category is renamed      |

**TTL** is configured via `REDIS_TTL` (default: 1 hour).

**Cache invalidation rules:**
- `createCategory` → clears `categories:all`
- `updateCategory` → clears `category:<id>`, `category:name:<old_name>`, `categories:all`
- `deactivateCategory` / `activateCategory` → clears the category and all affected descendants from cache
- `deleteCategory` → clears `category:<id>`, `categories:all`

---

## Category Deactivation Behavior

When a category is deactivated:

1. The target category's `isActive` is set to `false`.
2. All documents where `ancestors` array contains the target category's ID are also set to `isActive: false` in a single bulk update:

```ts
await Category.updateMany(
  { ancestors: categoryId },
  { $set: { isActive: false } }
);
```

This is a single atomic MongoDB operation regardless of nesting depth — no recursion needed.

Re-activating a category does **not** automatically re-activate its children; each child must be re-activated individually to avoid unintentionally restoring a subtree the user had previously deactivated.

---

## Scripts

| Command         | Description                        |
|-----------------|------------------------------------|
| `npm run dev`   | Start dev server with hot reload   |
| `npm run build` | Compile TypeScript to `dist/`      |
| `npm start`     | Run compiled production build      |
| `npm test`      | Run test suite                     |
