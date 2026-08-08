import type { LayoutCoord, ProjectPreviewFrame } from "@/bridge/types";

export type AuthoringPreviewSnapshot =
  | { type: "layout"; coords: LayoutCoord[] }
  | { type: "project"; frame: ProjectPreviewFrame };

let latestSnapshot: AuthoringPreviewSnapshot | null = null;

export function publishLayoutPreview(coords: LayoutCoord[]) {
  latestSnapshot = { type: "layout", coords };
  window.dispatchEvent(new CustomEvent("engine:layout-draft-coords", { detail: coords }));
}

export function publishProjectPreview(frame: ProjectPreviewFrame) {
  latestSnapshot = { type: "project", frame };
  window.dispatchEvent(new CustomEvent("engine:project-preview-frame", { detail: frame }));
}

export function latestAuthoringPreview() {
  return latestSnapshot;
}

export function resetAuthoringPreview() {
  latestSnapshot = null;
}
