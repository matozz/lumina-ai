import { useMemo, useState } from "react";
import { authoringSessionKey, useAuthoringTransportStore } from "@/authoring/transport";
import { Braces, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";

type AssetKind = "manifest" | "stage" | "effects" | "cues" | "arrangements";

const assetKinds = [
  { value: "manifest", label: "Project Manifest" },
  { value: "stage", label: "Stages" },
  { value: "effects", label: "Effects" },
  { value: "cues", label: "Cues" },
  { value: "arrangements", label: "Arrangements" },
] satisfies Array<{ value: AssetKind; label: string }>;

export function ProjectAssetInspector({ workspace }: { workspace: WorkspaceId }) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const effectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const [kind, setKind] = useState<AssetKind>("manifest");
  const value = useMemo(() => {
    if (kind === "manifest") return bundle.manifest;
    if (kind === "stage") return bundle.stages;
    return bundle[kind];
  }, [bundle, kind]);
  const effect = exactAsset(bundle.effects, effectRef);

  const placeSingleEffect = () => {
    if (!effectRef || !effect) return;
    projectActions.createCue([effectRef], `Advanced · ${effect.name}`);
    const cueRef = useProjectStore.getState().selectedCueRef;
    const cue = exactAsset(useProjectStore.getState().bundle.cues, cueRef);
    if (!cueRef || !cue) return;
    const sessionKey = authoringSessionKey("arrangement", assetKey(arrangementRef));
    const playheadTick =
      useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
    projectActions.updateArrangement(
      arrangementRef,
      "Place single Effect as explicit Cue",
      (arrangement) => {
        const track = arrangement.tracks[0];
        track.clips ??= [];
        track.clips.push({
          id: `${cue.id}-clip-${track.clips.length + 1}`,
          cue_ref: cueRef,
          start_tick: playheadTick,
          duration_tick: cue.nominal_length_ticks,
          source_offset_tick: 0,
          playback: "loop",
          layer: 0,
          layer_overrides: [],
        });
      },
    );
  };

  return (
    <section className="bg-background flex h-full min-h-0 flex-col" aria-label="Advanced assets">
      <WorkspacePanelHeader
        icon={Braces}
        title="Independent asset inspector"
        className="bg-card h-10 px-3"
      >
        <Badge variant="outline">JSON read-only</Badge>
        {workspace === "arrange" && (
          <Button size="xs" variant="outline" disabled={!effect} onClick={placeSingleEffect}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Place selected Effect as Cue
          </Button>
        )}
        <Select
          items={assetKinds}
          value={kind}
          onValueChange={(next) => next && setKind(next as AssetKind)}
        >
          <SelectTrigger size="sm" className="ml-auto min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {assetKinds.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </WorkspacePanelHeader>
      <ScrollArea className="min-h-0 flex-1">
        <pre
          className="text-foreground overflow-x-auto p-4 font-mono text-xs leading-relaxed"
          data-user-select="text"
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      </ScrollArea>
    </section>
  );
}
