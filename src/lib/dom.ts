export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.matches("input, textarea, select") || target.closest('[contenteditable="true"]') !== null
  );
}
