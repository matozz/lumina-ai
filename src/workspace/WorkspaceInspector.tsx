import type { WorkspaceId } from "@/stores/workspace";
import { ArrangementInspector } from "./arrange/ArrangementInspector";
import { CueBuilderInspector } from "./cues/CueBuilderInspector";
import { EffectLabInspector } from "./effect-lab/EffectLabInspector";
import { LiveRehearsalInspector } from "./live/LiveRehearsalInspector";
import { ProjectStageInspector } from "./stage/ProjectStageInspector";

export function WorkspaceInspector({ workspace }: { workspace: WorkspaceId }) {
  if (workspace === "stage") return <ProjectStageInspector />;
  if (workspace === "effect-lab") return <EffectLabInspector />;
  if (workspace === "cues") return <CueBuilderInspector />;
  if (workspace === "arrange") return <ArrangementInspector />;
  return <LiveRehearsalInspector />;
}
