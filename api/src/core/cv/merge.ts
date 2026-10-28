// T-18 (CVB-16). Regeneration merge (spec §3.6, domain-model CvItem invariant): an item with
// userEdited=true is kept verbatim and wins over any generated item at the same path. Every
// other stored item is replaced by the regenerated set. Pure function: no I/O.
// Used by the regenerate path (lane 05 jobs) and by the contract of answering a question (T-20).

export interface MergeableItem {
  id: string;
  path: string;
  parentId?: string;
  userEdited: boolean;
}

export function mergeRegenerated<T extends MergeableItem>(existing: readonly T[], generated: readonly T[]): T[] {
  const kept = existing.filter((item) => item.userEdited);
  const occupied = new Set(kept.map((item) => item.path));
  const added: T[] = [];
  for (const item of generated) {
    if (occupied.has(item.path)) continue;
    occupied.add(item.path);
    added.push(item);
  }

  // A generated child of a kept parent points at the kept parent's id, not at the generated one.
  const merged = [...kept, ...added];
  const storedById = new Map(existing.map((item) => [item.id, item]));
  const generatedById = new Map(generated.map((item) => [item.id, item]));
  const idByPath = new Map(merged.map((item) => [item.path, item.id]));
  return merged.map((item) => {
    if (item.parentId === undefined) return item;
    const parent = storedById.get(item.parentId) ?? generatedById.get(item.parentId);
    const parentId = parent ? idByPath.get(parent.path) : undefined;
    return parentId !== undefined && parentId !== item.parentId ? { ...item, parentId } : item;
  });
}
