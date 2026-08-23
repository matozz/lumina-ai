import type { LayoutCoord, ProjectPreviewFrame } from "@/bridge/types";

export type AuthoringPreviewSnapshot =
  | { type: "layout"; coords: LayoutCoord[] }
  | { type: "project"; frame: ProjectPreviewFrame };

let latestSnapshot: AuthoringPreviewSnapshot | null = null;
let latestProjectLayout: { generation: number; coords: LayoutCoord[] } | null = null;

export function publishLayoutPreview(coords: LayoutCoord[]) {
  latestSnapshot = { type: "layout", coords };
  window.dispatchEvent(new CustomEvent("engine:layout-draft-coords", { detail: coords }));
}

export function publishProjectPreview(frame: ProjectPreviewFrame) {
  if (frame.layout_coords.length > 0) {
    latestProjectLayout = { generation: frame.generation, coords: frame.layout_coords };
  }
  const cachedLayout =
    latestProjectLayout?.generation === frame.generation ? latestProjectLayout.coords : [];
  const resolvedFrame =
    frame.layout_coords.length === 0 && cachedLayout.length > 0
      ? { ...frame, layout_coords: cachedLayout }
      : frame;
  latestSnapshot = { type: "project", frame: resolvedFrame };
  window.dispatchEvent(new CustomEvent("engine:project-preview-frame", { detail: resolvedFrame }));
  return resolvedFrame;
}

export function latestAuthoringPreview() {
  return latestSnapshot;
}

export function resetAuthoringPreview() {
  latestSnapshot = null;
  latestProjectLayout = null;
}
