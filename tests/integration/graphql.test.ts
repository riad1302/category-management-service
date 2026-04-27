import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../../src/graphql/typeDefs';
import { resolvers } from '../../src/graphql/resolvers';
import { connectTestDB, disconnectTestDB, clearCollections } from '../helpers/db';

jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  },
}));

let server: ApolloServer;

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await server.executeOperation({ query, variables });
  if (res.body.kind !== 'single') throw new Error('Expected single result');
  return res.body.singleResult;
}

beforeAll(async () => {
  await connectTestDB();
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
});

afterAll(async () => {
  await server.stop();
  await disconnectTestDB();
});

afterEach(async () => clearCollections());

// ─── createCategory ────────────────────────────────────────────────────────

describe('Mutation: createCategory', () => {
  it('creates a root category', async () => {
    const { data, errors } = await gql(
      `mutation { createCategory(name: "Electronics") { id name isActive ancestors { name } parent { name } } }`,
    );

    expect(errors).toBeUndefined();
    expect((data as any).createCategory.name).toBe('Electronics');
    expect((data as any).createCategory.isActive).toBe(true);
    expect((data as any).createCategory.ancestors).toHaveLength(0);
    expect((data as any).createCategory.parent).toBeNull();
  });

  it('creates a nested category with parent and ancestor chain', async () => {
    const { data: d1 } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const parentId = (d1 as any).createCategory.id;

    const { data, errors } = await gql(
      `mutation($p: ID!) {
        createCategory(name: "Accessories", parentId: $p) {
          name
          parent { name }
          ancestors { name }
        }
      }`,
      { p: parentId },
    );

    expect(errors).toBeUndefined();
    expect((data as any).createCategory.parent.name).toBe('Electronics');
    expect((data as any).createCategory.ancestors.map((a: any) => a.name)).toEqual(['Electronics']);
  });

  it('returns an error on duplicate name', async () => {
    await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const { errors } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
  });

  it('returns an error when parent does not exist', async () => {
    const { errors } = await gql(
      `mutation { createCategory(name: "X", parentId: "507f1f77bcf86cd799439011") { id } }`,
    );
    expect(errors).toBeDefined();
  });
});

// ─── categories ────────────────────────────────────────────────────────────

describe('Query: categories', () => {
  it('returns all categories', async () => {
    await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    await gql(`mutation { createCategory(name: "Appliances") { id } }`);

    const { data } = await gql(`query { categories { name } }`);
    expect((data as any).categories).toHaveLength(2);
  });

  it('filters by isActive=true', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    await gql(`mutation($id: ID!) { deactivateCategory(id: $id) { id } }`, {
      id: (d as any).createCategory.id,
    });
    await gql(`mutation { createCategory(name: "Appliances") { id } }`);

    const { data } = await gql(`query { categories(isActive: true) { name } }`);
    const names = (data as any).categories.map((c: any) => c.name);
    expect(names).toEqual(['Appliances']);
  });

  it('filters by isActive=false', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    await gql(`mutation($id: ID!) { deactivateCategory(id: $id) { id } }`, {
      id: (d as any).createCategory.id,
    });

    const { data } = await gql(`query { categories(isActive: false) { name } }`);
    expect((data as any).categories.map((c: any) => c.name)).toContain('Electronics');
  });
});

// ─── category ──────────────────────────────────────────────────────────────

describe('Query: category', () => {
  it('returns full ancestor chain — Electronics > Accessories > Wearable > Smart Watch', async () => {
    const { data: d1 } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const { data: d2 } = await gql(
      `mutation($p: ID!) { createCategory(name: "Accessories", parentId: $p) { id } }`,
      { p: (d1 as any).createCategory.id },
    );
    const { data: d3 } = await gql(
      `mutation($p: ID!) { createCategory(name: "Wearable Accessories", parentId: $p) { id } }`,
      { p: (d2 as any).createCategory.id },
    );
    const { data: d4 } = await gql(
      `mutation($p: ID!) { createCategory(name: "Smart Watch", parentId: $p) { id } }`,
      { p: (d3 as any).createCategory.id },
    );

    const { data, errors } = await gql(
      `query($id: ID!) { category(id: $id) { name parent { name } ancestors { name } children { name } } }`,
      { id: (d4 as any).createCategory.id },
    );

    expect(errors).toBeUndefined();
    expect((data as any).category.name).toBe('Smart Watch');
    expect((data as any).category.parent.name).toBe('Wearable Accessories');
    expect((data as any).category.ancestors.map((a: any) => a.name)).toEqual([
      'Electronics',
      'Accessories',
      'Wearable Accessories',
    ]);
  });

  it('returns children', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const parentId = (d as any).createCategory.id;
    await gql(`mutation($p: ID!) { createCategory(name: "Phones", parentId: $p) { id } }`, { p: parentId });
    await gql(`mutation($p: ID!) { createCategory(name: "Laptops", parentId: $p) { id } }`, { p: parentId });

    const { data } = await gql(
      `query($id: ID!) { category(id: $id) { children { name } } }`,
      { id: parentId },
    );
    const childNames = (data as any).category.children.map((c: any) => c.name).sort();
    expect(childNames).toEqual(['Laptops', 'Phones']);
  });

  it('returns null for an unknown id', async () => {
    const { data } = await gql(`query { category(id: "507f1f77bcf86cd799439011") { name } }`);
    expect((data as any).category).toBeNull();
  });
});

// ─── categoryByName ────────────────────────────────────────────────────────

describe('Query: categoryByName', () => {
  it('finds a category by exact name', async () => {
    await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const { data } = await gql(`query { categoryByName(name: "Electronics") { name } }`);
    expect((data as any).categoryByName.name).toBe('Electronics');
  });

  it('returns null when name is not found', async () => {
    const { data } = await gql(`query { categoryByName(name: "Ghost") { name } }`);
    expect((data as any).categoryByName).toBeNull();
  });
});

// ─── deactivateCategory ────────────────────────────────────────────────────

describe('Mutation: deactivateCategory', () => {
  it('deactivates the category', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const id = (d as any).createCategory.id;

    const { data } = await gql(`mutation($id: ID!) { deactivateCategory(id: $id) { name isActive } }`, { id });
    expect((data as any).deactivateCategory.isActive).toBe(false);
  });

  it('cascades deactivation to all descendants', async () => {
    const { data: d1 } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const rootId = (d1 as any).createCategory.id;
    await gql(`mutation($p: ID!) { createCategory(name: "Accessories", parentId: $p) { id } }`, { p: rootId });
    await gql(`mutation($p: ID!) { createCategory(name: "Wearable", parentId: $p) { id } }`, {
      p: rootId,
    });

    await gql(`mutation($id: ID!) { deactivateCategory(id: $id) { id } }`, { id: rootId });

    const { data } = await gql(`query { categories { name isActive } }`);
    const all: any[] = (data as any).categories;
    expect(all.every((c) => !c.isActive)).toBe(true);
  });
});

// ─── activateCategory ──────────────────────────────────────────────────────

describe('Mutation: activateCategory', () => {
  it('activates a single category without affecting children', async () => {
    const { data: d1 } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const rootId = (d1 as any).createCategory.id;
    const { data: d2 } = await gql(
      `mutation($p: ID!) { createCategory(name: "Accessories", parentId: $p) { id } }`,
      { p: rootId },
    );

    await gql(`mutation($id: ID!) { deactivateCategory(id: $id) { id } }`, { id: rootId });
    const { data } = await gql(
      `mutation($id: ID!) { activateCategory(id: $id) { name isActive } }`,
      { id: rootId },
    );

    expect((data as any).activateCategory.isActive).toBe(true);

    // Child must remain inactive
    const { data: childData } = await gql(
      `query($id: ID!) { category(id: $id) { isActive } }`,
      { id: (d2 as any).createCategory.id },
    );
    expect((childData as any).category.isActive).toBe(false);
  });
});

// ─── updateCategory ────────────────────────────────────────────────────────

describe('Mutation: updateCategory', () => {
  it('updates the category name', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const id = (d as any).createCategory.id;

    const { data } = await gql(
      `mutation($id: ID!) { updateCategory(id: $id, name: "Consumer Electronics") { name } }`,
      { id },
    );
    expect((data as any).updateCategory.name).toBe('Consumer Electronics');
  });

  it('returns an error on circular parent reference', async () => {
    const { data: d1 } = await gql(`mutation { createCategory(name: "Parent") { id } }`);
    const parentId = (d1 as any).createCategory.id;
    const { data: d2 } = await gql(
      `mutation($p: ID!) { createCategory(name: "Child", parentId: $p) { id } }`,
      { p: parentId },
    );
    const childId = (d2 as any).createCategory.id;

    const { errors } = await gql(
      `mutation($id: ID!, $p: ID!) { updateCategory(id: $id, parentId: $p) { id } }`,
      { id: parentId, p: childId },
    );
    expect(errors).toBeDefined();
  });
});

// ─── deleteCategory ────────────────────────────────────────────────────────

describe('Mutation: deleteCategory', () => {
  it('deletes a leaf category', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const id = (d as any).createCategory.id;

    const { data, errors } = await gql(
      `mutation($id: ID!) { deleteCategory(id: $id) }`,
      { id },
    );
    expect(errors).toBeUndefined();
    expect((data as any).deleteCategory).toBe(true);
  });

  it('returns an error when category has children', async () => {
    const { data: d } = await gql(`mutation { createCategory(name: "Electronics") { id } }`);
    const id = (d as any).createCategory.id;
    await gql(`mutation($p: ID!) { createCategory(name: "Accessories", parentId: $p) { id } }`, { p: id });

    const { errors } = await gql(`mutation($id: ID!) { deleteCategory(id: $id) }`, { id });
    expect(errors).toBeDefined();
  });
});
