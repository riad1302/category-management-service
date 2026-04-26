import { Schema, model, Types, Document } from 'mongoose';

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  parent: Types.ObjectId | null;
  ancestors: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CategorySchema.index({ ancestors: 1 });
CategorySchema.index({ parent: 1 });

export const Category = model<ICategory>('Category', CategorySchema);
