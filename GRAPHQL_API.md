# GraphQL API Documentation

**Endpoint:** `POST http://localhost:4000/graphql`  
**Playground:** Open `http://localhost:4000/graphql` in a browser (Apollo Sandbox).

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Create Category](#create-category)
3. [Read Categories](#read-categories)
   - [List all categories](#list-all-categories)
   - [Get by ID](#get-by-id)
4. [Search by Name](#search-by-name)
5. [Update Category](#update-category)
6. [Activate / Deactivate](#activate--deactivate)
7. [Delete Category](#delete-category)
8. [Using Variables](#using-variables)
9. [Error Reference](#error-reference)

---

## Schema Overview

```graphql
type Category {
  id: ID!
  name: String!
  parent: Category         # null if this is a root category
  ancestors: [Category!]!  # ordered list: root → direct parent
  children: [Category!]!   # immediate children
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

## Create Category

### Create a root category

A root category has no parent. The `ancestors` array will be empty.

```graphql
mutation CreateRoot {
  createCategory(name: "Electronics") {
    id
    name
    isActive
    ancestors { id name }
  }
}
```

**Response**

```json
{
  "data": {
    "createCategory": {
      "id": "6630a1c2f1d3b20012a4e001",
      "name": "Electronics",
      "isActive": true,
      "ancestors": []
    }
  }
}
```

---

### Create a nested category

Pass `parentId` to attach the new category under an existing one. The service automatically builds the full `ancestors` array.

```graphql
mutation CreateNested {
  createCategory(name: "Accessories", parentId: "6630a1c2f1d3b20012a4e001") {
    id
    name
    parent { id name }
    ancestors { id name }
  }
}
```

**Response**

```json
{
  "data": {
    "createCategory": {
      "id": "6630a1c2f1d3b20012a4e002",
      "name": "Accessories",
      "parent": { "id": "6630a1c2f1d3b20012a4e001", "name": "Electronics" },
      "ancestors": [
        { "id": "6630a1c2f1d3b20012a4e001", "name": "Electronics" }
      ]
    }
  }
}
```

---

### Build a deep hierarchy (4 levels)

Run these mutations in order, using the `id` returned by each step as the `parentId` for the next.

```graphql
# Level 1 — root
mutation L1 {
  createCategory(name: "Electronics") { id }
}

# Level 2
mutation L2 {
  createCategory(name: "Accessories", parentId: "<L1_id>") { id }
}

# Level 3
mutation L3 {
  createCategory(name: "Wearable Accessories", parentId: "<L2_id>") { id }
}

# Level 4
mutation L4 {
  createCategory(name: "Smart Watch", parentId: "<L3_id>") {
    id
    name
    ancestors { name }
  }
}
```

**Level 4 response**

```json
{
  "data": {
    "createCategory": {
      "id": "6630a1c2f1d3b20012a4e004",
      "name": "Smart Watch",
      "ancestors": [
        { "name": "Electronics" },
        { "name": "Accessories" },
        { "name": "Wearable Accessories" }
      ]
    }
  }
}
```

---

## Read Categories

### List all categories

Returns every category regardless of active status.

```graphql
query ListAll {
  categories {
    id
    name
    isActive
    parent { id name }
    children { id name }
    ancestors { id name }
    createdAt
    updatedAt
  }
}
```

---

### List only active categories

```graphql
query ListActive {
  categories(isActive: true) {
    id
    name
    parent { name }
  }
}
```

---

### List only inactive categories

```graphql
query ListInactive {
  categories(isActive: false) {
    id
    name
    parent { name }
  }
}
```

---

### Get by ID

Returns `null` if the ID does not exist.

```graphql
query GetById {
  category(id: "6630a1c2f1d3b20012a4e004") {
    id
    name
    isActive
    parent   { id name }
    ancestors { id name }
    children  { id name }
    createdAt
    updatedAt
  }
}
```

**Response**

```json
{
  "data": {
    "category": {
      "id": "6630a1c2f1d3b20012a4e004",
      "name": "Smart Watch",
      "isActive": true,
      "parent": { "id": "6630a1c2f1d3b20012a4e003", "name": "Wearable Accessories" },
      "ancestors": [
        { "id": "6630a1c2f1d3b20012a4e001", "name": "Electronics" },
        { "id": "6630a1c2f1d3b20012a4e002", "name": "Accessories" },
        { "id": "6630a1c2f1d3b20012a4e003", "name": "Wearable Accessories" }
      ],
      "children": [],
      "createdAt": "2026-04-28T10:00:00.000Z",
      "updatedAt": "2026-04-28T10:00:00.000Z"
    }
  }
}
```

**Response when not found**

```json
{
  "data": {
    "category": null
  }
}
```

---

## Search by Name

Finds a category by its exact name (case-sensitive). Returns `null` if not found.  
The result is cached in Redis — repeated searches for the same name do not hit the database.

```graphql
query SearchByName {
  categoryByName(name: "Smart Watch") {
    id
    name
    isActive
    parent   { id name }
    ancestors { id name }
    children  { id name }
  }
}
```

**Response**

```json
{
  "data": {
    "categoryByName": {
      "id": "6630a1c2f1d3b20012a4e004",
      "name": "Smart Watch",
      "isActive": true,
      "parent": { "id": "6630a1c2f1d3b20012a4e003", "name": "Wearable Accessories" },
      "ancestors": [
        { "id": "6630a1c2f1d3b20012a4e001", "name": "Electronics" },
        { "id": "6630a1c2f1d3b20012a4e002", "name": "Accessories" },
        { "id": "6630a1c2f1d3b20012a4e003", "name": "Wearable Accessories" }
      ],
      "children": []
    }
  }
}
```

**Response when not found**

```json
{
  "data": {
    "categoryByName": null
  }
}
```

> **Note:** The search is exact. `"smart watch"` and `"SMART WATCH"` will not match `"Smart Watch"`.

---

## Update Category

### Rename a category

```graphql
mutation Rename {
  updateCategory(id: "6630a1c2f1d3b20012a4e001", name: "Consumer Electronics") {
    id
    name
    updatedAt
  }
}
```

**Response**

```json
{
  "data": {
    "updateCategory": {
      "id": "6630a1c2f1d3b20012a4e001",
      "name": "Consumer Electronics",
      "updatedAt": "2026-04-28T11:00:00.000Z"
    }
  }
}
```

---

### Move a category to a different parent

Moving a category automatically rebuilds the `ancestors` array for the category **and all its descendants**.

```graphql
mutation Move {
  updateCategory(
    id: "6630a1c2f1d3b20012a4e002"
    parentId: "6630a1c2f1d3b20012a4e005"
  ) {
    id
    name
    parent   { name }
    ancestors { name }
  }
}
```

---

### Move a category to root (remove parent)

Pass `parentId: null` to detach the category from its current parent.

```graphql
mutation MoveToRoot {
  updateCategory(id: "6630a1c2f1d3b20012a4e002", parentId: null) {
    id
    name
    parent
    ancestors { name }
  }
}
```

---

### Rename and move in one call

Both `name` and `parentId` can be provided together.

```graphql
mutation RenameAndMove {
  updateCategory(
    id: "6630a1c2f1d3b20012a4e002"
    name: "Peripherals"
    parentId: "6630a1c2f1d3b20012a4e005"
  ) {
    id
    name
    parent   { name }
    ancestors { name }
  }
}
```

---

## Activate / Deactivate

### Deactivate a category

Deactivating a category **cascades** — all descendant categories are also set to `isActive: false` in a single database operation.

```graphql
mutation Deactivate {
  deactivateCategory(id: "6630a1c2f1d3b20012a4e001") {
    id
    name
    isActive
  }
}
```

**Response**

```json
{
  "data": {
    "deactivateCategory": {
      "id": "6630a1c2f1d3b20012a4e001",
      "name": "Electronics",
      "isActive": false
    }
  }
}
```

---

### Activate a category

Activating a category affects **only that category** — descendants are not automatically re-activated and must be activated one by one.

```graphql
mutation Activate {
  activateCategory(id: "6630a1c2f1d3b20012a4e001") {
    id
    name
    isActive
  }
}
```

---

## Delete Category

Hard-deletes a category from the database. Only allowed when the category has **no children**. If children exist, deactivate the category instead.

```graphql
mutation Delete {
  deleteCategory(id: "6630a1c2f1d3b20012a4e004")
}
```

**Response on success**

```json
{
  "data": {
    "deleteCategory": true
  }
}
```

**Response when category has children**

```json
{
  "errors": [
    {
      "message": "Cannot delete a category with children — deactivate it instead"
    }
  ]
}
```

---

## Using Variables

All mutations and queries support GraphQL variables. This is the recommended approach when calling the API from application code.

### Create with variables

```graphql
mutation CreateCategory($name: String!, $parentId: ID) {
  createCategory(name: $name, parentId: $parentId) {
    id
    name
    parent { name }
    ancestors { name }
  }
}
```

**Variables**

```json
{
  "name": "Smart Watch",
  "parentId": "6630a1c2f1d3b20012a4e003"
}
```

---

### Get by ID with variables

```graphql
query GetCategory($id: ID!) {
  category(id: $id) {
    id
    name
    isActive
    ancestors { name }
  }
}
```

**Variables**

```json
{
  "id": "6630a1c2f1d3b20012a4e004"
}
```

---

### Search by name with variables

```graphql
query SearchCategory($name: String!) {
  categoryByName(name: $name) {
    id
    name
    isActive
    ancestors { name }
  }
}
```

**Variables**

```json
{
  "name": "Smart Watch"
}
```

---

### Update with variables

```graphql
mutation UpdateCategory($id: ID!, $name: String, $parentId: ID) {
  updateCategory(id: $id, name: $name, parentId: $parentId) {
    id
    name
    parent   { name }
    ancestors { name }
  }
}
```

**Variables**

```json
{
  "id": "6630a1c2f1d3b20012a4e002",
  "name": "Peripherals"
}
```

---

### Using curl with variables

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation CreateCategory($name: String!, $parentId: ID) { createCategory(name: $name, parentId: $parentId) { id name } }",
    "variables": { "name": "Smart Watch", "parentId": "6630a1c2f1d3b20012a4e003" }
  }'
```

---

## Error Reference

| Error message | Cause |
|---|---|
| `Parent category not found` | The `parentId` does not match any existing category |
| `Parent category is inactive` | Cannot nest a new category under an inactive parent |
| `Category not found` | The `id` passed to update / activate / deactivate / delete does not exist |
| `A category cannot be its own parent` | `parentId` equals the category's own `id` |
| `Circular reference: new parent is a descendant of this category` | Moving a category under one of its own descendants |
| `Cannot delete a category with children — deactivate it instead` | `deleteCategory` called on a category that still has children |

All errors are returned in the standard GraphQL `errors` array:

```json
{
  "errors": [
    {
      "message": "Parent category not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["createCategory"]
    }
  ],
  "data": null
}
```
