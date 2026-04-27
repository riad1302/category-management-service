import { CategoryService } from '../../src/services/category.service';
import { Category } from '../../src/models/Category';
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

beforeAll(async () => connectTestDB());
afterAll(async () => disconnectTestDB());
afterEach(async () => clearCollections());

// ─── create ────────────────────────────────────────────────────────────────

describe('CategoryService.create', () => {
  it('creates a root category', async () => {
    const cat = await CategoryService.create('Electronics');

    expect(cat.name).toBe('Electronics');
    expect(cat.parent).toBeNull();
    expect(cat.ancestors).toHaveLength(0);
    expect(cat.isActive).toBe(true);
  });

  it('creates a nested category with correct parent and ancestors', async () => {
    const root = await CategoryService.create('Electronics');
    const child = await CategoryService.create('Accessories', root._id.toString());

    expect((child.parent as any).name).toBe('Electronics');
    expect(child.ancestors).toHaveLength(1);
    expect((child.ancestors[0] as any).name).toBe('Electronics');
  });

  it('builds ancestors for 4-level deep category', async () => {
    const l1 = await CategoryService.create('Electronics');
    const l2 = await CategoryService.create('Accessories', l1._id.toString());
    const l3 = await CategoryService.create('Wearable Accessories', l2._id.toString());
    const l4 = await CategoryService.create('Smart Watch', l3._id.toString());

    const names = (l4.ancestors as any[]).map((a) => a.name);
    expect(names).toEqual(['Electronics', 'Accessories', 'Wearable Accessories']);
  });

  it('throws on duplicate name', async () => {
    await CategoryService.create('Electronics');
    await expect(CategoryService.create('Electronics')).rejects.toThrow();
  });

  it('throws when parent does not exist', async () => {
    await expect(
      CategoryService.create('Accessories', '507f1f77bcf86cd799439011'),
    ).rejects.toThrow('Parent category not found');
  });

  it('throws when parent is inactive', async () => {
    const parent = await CategoryService.create('Electronics');
    await CategoryService.deactivate(parent._id.toString());

    await expect(
      CategoryService.create('Accessories', parent._id.toString()),
    ).rejects.toThrow('Parent category is inactive');
  });
});

// ─── getById ───────────────────────────────────────────────────────────────

describe('CategoryService.getById', () => {
  it('returns category with populated parent and ancestors', async () => {
    const root = await CategoryService.create('Electronics');
    const child = await CategoryService.create('Accessories', root._id.toString());

    const found = await CategoryService.getById(child._id.toString());

    expect(found).not.toBeNull();
    expect(found!.name).toBe('Accessories');
    expect((found!.parent as any).name).toBe('Electronics');
    expect(found!.ancestors).toHaveLength(1);
  });

  it('returns null for a non-existent id', async () => {
    const result = await CategoryService.getById('507f1f77bcf86cd799439011');
    expect(result).toBeNull();
  });
});

// ─── getByName ─────────────────────────────────────────────────────────────

describe('CategoryService.getByName', () => {
  it('finds a category by exact name', async () => {
    await CategoryService.create('Electronics');
    const found = await CategoryService.getByName('Electronics');
    expect(found?.name).toBe('Electronics');
  });

  it('returns null when name does not match', async () => {
    const found = await CategoryService.getByName('NonExistent');
    expect(found).toBeNull();
  });
});

// ─── getAll ────────────────────────────────────────────────────────────────

describe('CategoryService.getAll', () => {
  beforeEach(async () => {
    const root = await CategoryService.create('Electronics');
    await CategoryService.create('Appliances');
    const child = await CategoryService.create('Accessories', root._id.toString());
    await CategoryService.deactivate(child._id.toString());
  });

  it('returns all categories when no filter is given', async () => {
    const all = await CategoryService.getAll();
    expect(all).toHaveLength(3);
  });

  it('returns only active categories when isActive=true', async () => {
    const active = await CategoryService.getAll(true);
    expect(active.every((c) => c.isActive)).toBe(true);
    expect(active).toHaveLength(2);
  });

  it('returns only inactive categories when isActive=false', async () => {
    const inactive = await CategoryService.getAll(false);
    expect(inactive.every((c) => !c.isActive)).toBe(true);
    expect(inactive).toHaveLength(1);
  });
});

// ─── deactivate ────────────────────────────────────────────────────────────

describe('CategoryService.deactivate', () => {
  it('deactivates the target category', async () => {
    const cat = await CategoryService.create('Electronics');
    const result = await CategoryService.deactivate(cat._id.toString());
    expect(result.isActive).toBe(false);
  });

  it('cascades deactivation to all descendants', async () => {
    const root = await CategoryService.create('Electronics');
    const child = await CategoryService.create('Accessories', root._id.toString());
    const grandchild = await CategoryService.create('Wearable', child._id.toString());

    await CategoryService.deactivate(root._id.toString());

    const [updatedChild, updatedGrandchild] = await Promise.all([
      Category.findById(child._id),
      Category.findById(grandchild._id),
    ]);

    expect(updatedChild!.isActive).toBe(false);
    expect(updatedGrandchild!.isActive).toBe(false);
  });

  it('throws when category does not exist', async () => {
    await expect(
      CategoryService.deactivate('507f1f77bcf86cd799439011'),
    ).rejects.toThrow('Category not found');
  });
});

// ─── activate ──────────────────────────────────────────────────────────────

describe('CategoryService.activate', () => {
  it('activates an inactive category', async () => {
    const cat = await CategoryService.create('Electronics');
    await CategoryService.deactivate(cat._id.toString());

    const result = await CategoryService.activate(cat._id.toString());
    expect(result.isActive).toBe(true);
  });

  it('does not auto-activate child categories', async () => {
    const root = await CategoryService.create('Electronics');
    const child = await CategoryService.create('Accessories', root._id.toString());

    await CategoryService.deactivate(root._id.toString());
    await CategoryService.activate(root._id.toString());

    const updatedChild = await Category.findById(child._id);
    expect(updatedChild!.isActive).toBe(false);
  });
});

// ─── update ────────────────────────────────────────────────────────────────

describe('CategoryService.update', () => {
  it('updates the category name', async () => {
    const cat = await CategoryService.create('Electronics');
    const updated = await CategoryService.update(cat._id.toString(), 'Consumer Electronics');
    expect(updated.name).toBe('Consumer Electronics');
  });

  it('re-parents category and updates all descendants ancestors', async () => {
    const rootA = await CategoryService.create('A');
    const rootB = await CategoryService.create('B');
    const child = await CategoryService.create('Child', rootA._id.toString());
    const grandchild = await CategoryService.create('Grandchild', child._id.toString());

    await CategoryService.update(child._id.toString(), undefined, rootB._id.toString());

    const updatedGrandchild = await Category.findById(grandchild._id);
    const ids = updatedGrandchild!.ancestors.map((a) => a.toString());

    expect(ids).toContain(rootB._id.toString());
    expect(ids).toContain(child._id.toString());
    expect(ids).not.toContain(rootA._id.toString());
  });

  it('throws when trying to set self as parent', async () => {
    const cat = await CategoryService.create('Electronics');
    await expect(
      CategoryService.update(cat._id.toString(), undefined, cat._id.toString()),
    ).rejects.toThrow('A category cannot be its own parent');
  });

  it('throws on circular parent reference', async () => {
    const parent = await CategoryService.create('Parent');
    const child = await CategoryService.create('Child', parent._id.toString());

    await expect(
      CategoryService.update(parent._id.toString(), undefined, child._id.toString()),
    ).rejects.toThrow('Circular reference');
  });
});

// ─── delete ────────────────────────────────────────────────────────────────

describe('CategoryService.delete', () => {
  it('deletes a leaf category', async () => {
    const cat = await CategoryService.create('Electronics');
    const result = await CategoryService.delete(cat._id.toString());

    expect(result).toBe(true);
    expect(await Category.findById(cat._id)).toBeNull();
  });

  it('throws when category has children', async () => {
    const parent = await CategoryService.create('Electronics');
    await CategoryService.create('Accessories', parent._id.toString());

    await expect(CategoryService.delete(parent._id.toString())).rejects.toThrow(
      'Cannot delete a category with children',
    );
  });

  it('throws when category does not exist', async () => {
    await expect(
      CategoryService.delete('507f1f77bcf86cd799439011'),
    ).rejects.toThrow('Category not found');
  });
});
