import { Types } from 'mongoose';
import { Category, ICategory } from '../models/Category.js';
import { getCache, setCache, delCache, KEYS } from '../cache/category.cache.js';

// Plain object returned by .lean() with populated fields
export type CategoryLean = {
  _id: Types.ObjectId;
  name: string;
  parent: CategoryLean | null;
  ancestors: CategoryLean[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

async function fetchPopulated(id: string | Types.ObjectId): Promise<CategoryLean | null> {
  return Category.findById(id)
    .populate<{ parent: CategoryLean | null }>('parent')
    .populate<{ ancestors: CategoryLean[] }>('ancestors')
    .lean() as Promise<CategoryLean | null>;
}

export const CategoryService = {
  async getAll(isActive?: boolean): Promise<CategoryLean[]> {
    const cached = await getCache<CategoryLean[]>(KEYS.all);
    if (cached) {
      return isActive !== undefined ? cached.filter((c) => c.isActive === isActive) : cached;
    }

    const filter = isActive !== undefined ? { isActive } : {};
    const docs = (await Category.find(filter)
      .populate<{ parent: CategoryLean | null }>('parent')
      .populate<{ ancestors: CategoryLean[] }>('ancestors')
      .lean()) as CategoryLean[];

    await setCache(KEYS.all, docs);
    return docs;
  },

  async getById(id: string): Promise<CategoryLean | null> {
    const cached = await getCache<CategoryLean>(KEYS.category(id));
    if (cached) return cached;

    const doc = await fetchPopulated(id);
    if (doc) await setCache(KEYS.category(id), doc);
    return doc;
  },

  async getByName(name: string): Promise<CategoryLean | null> {
    const cached = await getCache<CategoryLean>(KEYS.byName(name));
    if (cached) return cached;

    const doc = (await Category.findOne({ name })
      .populate<{ parent: CategoryLean | null }>('parent')
      .populate<{ ancestors: CategoryLean[] }>('ancestors')
      .lean()) as CategoryLean | null;

    if (doc) await setCache(KEYS.byName(name), doc);
    return doc;
  },

  async create(name: string, parentId?: string): Promise<CategoryLean> {
    let ancestors: Types.ObjectId[] = [];
    let parent: Types.ObjectId | null = null;

    if (parentId) {
      const parentDoc = await Category.findById(parentId);
      if (!parentDoc) throw new Error('Parent category not found');
      if (!parentDoc.isActive) throw new Error('Parent category is inactive');
      parent = parentDoc._id;
      ancestors = [...parentDoc.ancestors, parentDoc._id];
    }

    const doc = await Category.create({ name, parent, ancestors });
    await delCache(KEYS.all);
    return (await fetchPopulated(doc._id))!;
  },

  async update(id: string, name?: string, parentId?: string | null): Promise<CategoryLean> {
    const doc = await Category.findById(id);
    if (!doc) throw new Error('Category not found');

    const oldName = doc.name;

    if (name && name !== doc.name) doc.name = name;

    if (parentId !== undefined) {
      if (parentId === id) throw new Error('A category cannot be its own parent');

      let newAncestors: Types.ObjectId[] = [];
      let newParent: Types.ObjectId | null = null;

      if (parentId) {
        const newParentDoc = await Category.findById(parentId);
        if (!newParentDoc) throw new Error('New parent category not found');
        const isCircular = newParentDoc.ancestors.some((a) => a.toString() === id);
        if (isCircular) throw new Error('Circular reference: new parent is a descendant of this category');
        newParent = newParentDoc._id;
        newAncestors = [...newParentDoc.ancestors, newParentDoc._id];
      }

      // Update all descendants: replace the old ancestor prefix with the new one
      const descendants = await Category.find({ ancestors: doc._id });
      for (const desc of descendants) {
        const idx = desc.ancestors.findIndex((a) => a.toString() === id);
        desc.ancestors = [...newAncestors, doc._id, ...desc.ancestors.slice(idx + 1)];
        await desc.save();
        await delCache(KEYS.category(desc._id.toString()));
      }

      doc.parent = newParent;
      doc.ancestors = newAncestors;
    }

    await doc.save();
    await delCache(KEYS.category(id), KEYS.byName(oldName), KEYS.all);
    return (await fetchPopulated(id))!;
  },

  async deactivate(id: string): Promise<CategoryLean> {
    const doc = await Category.findById(id);
    if (!doc) throw new Error('Category not found');

    doc.isActive = false;
    await doc.save();

    // Cascade: deactivate all descendants in a single bulk write
    const descendants = await Category.find({ ancestors: doc._id }, '_id name');
    await Category.updateMany({ ancestors: doc._id }, { $set: { isActive: false } });

    await delCache(
      KEYS.category(id),
      KEYS.byName(doc.name),
      KEYS.all,
      ...descendants.map((d) => KEYS.category(d._id.toString())),
      ...descendants.map((d) => KEYS.byName(d.name)),
    );

    return (await fetchPopulated(id))!;
  },

  async activate(id: string): Promise<CategoryLean> {
    const doc = await Category.findById(id);
    if (!doc) throw new Error('Category not found');

    doc.isActive = true;
    await doc.save();

    await delCache(KEYS.category(id), KEYS.byName(doc.name), KEYS.all);
    return (await fetchPopulated(id))!;
  },

  async delete(id: string): Promise<boolean> {
    const doc = await Category.findById(id);
    if (!doc) throw new Error('Category not found');

    const hasChildren = await Category.exists({ parent: doc._id });
    if (hasChildren) throw new Error('Cannot delete a category with children — deactivate it instead');

    await Category.deleteOne({ _id: doc._id });
    await delCache(KEYS.category(id), KEYS.byName(doc.name), KEYS.all);
    return true;
  },
};
