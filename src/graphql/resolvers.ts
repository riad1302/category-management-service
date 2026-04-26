import { Category } from '../models/Category.js';
import { CategoryService, CategoryLean } from '../services/category.service.js';

export const resolvers = {
  Category: {
    id: (cat: CategoryLean) => cat._id.toString(),
    parent: (cat: CategoryLean) => cat.parent ?? null,
    ancestors: (cat: CategoryLean) => cat.ancestors ?? [],
    children: async (cat: CategoryLean) =>
      Category.find({ parent: cat._id })
        .populate<{ parent: CategoryLean | null }>('parent')
        .populate<{ ancestors: CategoryLean[] }>('ancestors')
        .lean(),
    createdAt: (cat: CategoryLean) =>
      cat.createdAt instanceof Date ? cat.createdAt.toISOString() : String(cat.createdAt),
    updatedAt: (cat: CategoryLean) =>
      cat.updatedAt instanceof Date ? cat.updatedAt.toISOString() : String(cat.updatedAt),
  },

  Query: {
    categories: (_: unknown, { isActive }: { isActive?: boolean }) =>
      CategoryService.getAll(isActive),

    category: (_: unknown, { id }: { id: string }) =>
      CategoryService.getById(id),

    categoryByName: (_: unknown, { name }: { name: string }) =>
      CategoryService.getByName(name),
  },

  Mutation: {
    createCategory: (_: unknown, { name, parentId }: { name: string; parentId?: string }) =>
      CategoryService.create(name, parentId),

    updateCategory: (
      _: unknown,
      { id, name, parentId }: { id: string; name?: string; parentId?: string | null },
    ) => CategoryService.update(id, name, parentId),

    deactivateCategory: (_: unknown, { id }: { id: string }) =>
      CategoryService.deactivate(id),

    activateCategory: (_: unknown, { id }: { id: string }) =>
      CategoryService.activate(id),

    deleteCategory: (_: unknown, { id }: { id: string }) =>
      CategoryService.delete(id),
  },
};
