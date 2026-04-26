export const typeDefs = `#graphql
  type Category {
    id: ID!
    name: String!
    parent: Category
    ancestors: [Category!]!
    children: [Category!]!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    "List all categories, optionally filtered by active status"
    categories(isActive: Boolean): [Category!]!
    "Get a single category by ID — includes full ancestor chain"
    category(id: ID!): Category
    "Find a category by exact name — includes full ancestor chain"
    categoryByName(name: String!): Category
  }

  type Mutation {
    "Create a new category. Optionally nest it under a parent."
    createCategory(name: String!, parentId: ID): Category!
    "Update name and/or parent. Pass parentId: null to move to root."
    updateCategory(id: ID!, name: String, parentId: ID): Category!
    "Deactivate a category and all its descendants."
    deactivateCategory(id: ID!): Category!
    "Activate a single category (children are NOT automatically re-activated)."
    activateCategory(id: ID!): Category!
    "Hard-delete a category. Only allowed when it has no children."
    deleteCategory(id: ID!): Boolean!
  }
`;
