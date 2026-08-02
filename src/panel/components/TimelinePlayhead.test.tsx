import { Profiler, createRef } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { TimelinePlayhead } from "./TimelinePlayhead";

describe("TimelinePlayhead", () => {
  beforeEach(() => {
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("updates its DOM transform without another React commit", () => {
    let commitCount = 0;
    const { container } = render(
      <Profiler id="playhead" onRender={() => (commitCount += 1)}>
        <TimelinePlayhead beatWidth={40} scrollRef={createRef<HTMLDivElement>()} />
      </Profiler>,
    );
    const playhead = container.firstElementChild as HTMLElement;
    const initialCommitCount = commitCount;

    act(() => engineActions.setGlobalBeat(2));

    expect(playhead.style.transform).toBe("translate3d(80px, 0, 0)");
    expect(commitCount).toBe(initialCommitCount);
  });
});
