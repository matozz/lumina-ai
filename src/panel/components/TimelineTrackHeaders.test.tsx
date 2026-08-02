import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStarterProject } from "@/workspace/defaultProject";
import type { TimelineTrackData } from "../types";
import { TimelineTrackHeaders } from "./TimelineTrackHeaders";

describe("TimelineTrackHeaders", () => {
  it("expands automation tracks with Enter and Space as alternatives to clicking", () => {
    const setExpandedTracks = vi.fn();
    const tracks: TimelineTrackData[] = [
      {
        id: "phaser:red-pulse",
        name: "Red Pulse",
        events: [],
        subTracks: [{ name: "Intensity", events: [] }],
      },
    ];
    const { rerender } = render(
      <TimelineTrackHeaders
        tracks={tracks}
        expandedTracks={{}}
        setExpandedTracks={setExpandedTracks}
        document={createStarterProject()}
        onAddAutomationLane={vi.fn()}
      />,
    );

    const expand = screen.getByRole("button", { name: "Expand Red Pulse" });
    expand.focus();
    fireEvent.keyDown(expand, { key: "Enter" });
    expect(document.activeElement).toBe(expand);
    expect(setExpandedTracks).toHaveBeenCalledWith({ "phaser:red-pulse": true });

    rerender(
      <TimelineTrackHeaders
        tracks={tracks}
        expandedTracks={{ "phaser:red-pulse": true }}
        setExpandedTracks={setExpandedTracks}
        document={createStarterProject()}
        onAddAutomationLane={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Collapse Red Pulse" }), { key: " " });
    expect(setExpandedTracks).toHaveBeenLastCalledWith({ "phaser:red-pulse": false });
  });
});
