// Remove the retired built-in when opening projects saved by earlier versions.
// Leave every other value untouched so normal schema validation still applies.
export function removeRetiredItems(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const project = value as Record<string, unknown>;
  if (!Array.isArray(project.items)) return value;
  return {
    ...project,
    items: project.items.filter(
      (item: unknown) =>
        !item || typeof item !== 'object' || (item as Record<string, unknown>).kind !== 'lightbar',
    ),
  };
}
