import type { UserAssetPack } from "@/bridge/types";

export function downloadUserAssetPack(pack: UserAssetPack) {
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileSlug(pack.name)}.lumina-assets.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readUserAssetPackFile(file: File) {
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
}

function fileSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lumina-assets"
  );
}
