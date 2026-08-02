import { describe, expect, it } from "vitest";
import tauriConfig from "../src-tauri/tauri.conf.json";

describe("main Tauri window configuration", () => {
  it("starts maximized without immersive fullscreen and enforces a usable minimum size", () => {
    const [mainWindow] = tauriConfig.app.windows;

    expect(mainWindow).toMatchObject({
      width: 1_440,
      height: 900,
      minWidth: 1_100,
      minHeight: 720,
      maximized: true,
      fullscreen: false,
    });
  });
});
