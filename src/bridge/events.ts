import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FramePayload, EngineStatePayload } from "./types";

export function onFrameUpdate(callback: (payload: FramePayload) => void): Promise<UnlistenFn> {
  return listen<FramePayload>("engine:frame-update", (e) => callback(e.payload));
}

export function onStateChange(callback: (state: EngineStatePayload) => void): Promise<UnlistenFn> {
  return listen<EngineStatePayload>("engine:state-change", (e) => callback(e.payload));
}

export function onBeat(callback: (beat: number) => void): Promise<UnlistenFn> {
  return listen<{ beat: number }>("engine:beat", (e) => callback(e.payload.beat));
}
