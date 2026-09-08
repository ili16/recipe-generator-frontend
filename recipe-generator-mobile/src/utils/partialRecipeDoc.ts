import { parse } from 'partial-json';
import { RecipeDocument } from '../types';

// Best-effort parse of the accumulated raw JSON text streamed from POST
// /generate/stream. Returns null while there isn't enough text to parse anything yet
// (e.g. the very first byte or two).
export function parsePartialRecipeDoc(rawJson: string): Partial<RecipeDocument> | null {
  if (!rawJson.trim()) return null;
  try {
    const doc = parse(rawJson);
    return doc && typeof doc === 'object' ? (doc as Partial<RecipeDocument>) : null;
  } catch {
    return null;
  }
}
