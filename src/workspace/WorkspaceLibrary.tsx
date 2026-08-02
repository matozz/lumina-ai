import { AudioLines, Boxes, Layers3, Lightbulb, RadioTower, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import {
  type WorkspaceId,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";
import { EffectCatalogLibrary } from "./effect-lab/EffectCatalogLibrary";

export function WorkspaceLibrary({ workspace }: { workspace: WorkspaceId }) {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const selectedEffectId = useWorkspaceStore(workspaceSelectors.selectedEffectId);
  const favorites = useWorkspaceStore(workspaceSelectors.favoriteEffectIds);

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label={`${workspace} library`}>
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <LibraryIcon workspace={workspace} />
        <span className="truncate text-xs font-medium">{libraryTitle(workspace)}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {workspace === "stage" &&
            document?.groups.map((group) => (
              <LibraryRow key={group.id} label={group.name} meta={fixtureCount(group.fixtures)} />
            ))}

          {workspace === "effect-lab" && document && <EffectCatalogLibrary document={document} />}

          {workspace === "live" &&
            document?.effect_definitions.map((effect) => (
              <Button
                key={effect.id}
                variant={selectedEffectId === effect.id ? "secondary" : "ghost"}
                size="sm"
                className="h-auto w-full justify-start py-1.5"
                onClick={() => workspaceActions.setSelectedEffectId(effect.id)}
              >
                <span className="min-w-0 flex-1 truncate text-left">{effect.name}</span>
                {favorites.includes(effect.id) && <Star aria-label="Favorite" />}
              </Button>
            ))}

          {workspace === "arrange" &&
            document?.timeline?.tracks.map((track) => (
              <LibraryRow
                key={track.id}
                label={track.name}
                meta={`${track.clips?.length ?? 0} clips`}
              />
            ))}

          {workspace === "song" && <SongEmptyState />}

          {workspace === "live" && document?.effect_definitions.length === 0 && (
            <CompactEmpty
              icon={Boxes}
              title="No effects yet"
              description="Create the first reusable look in Effect Lab."
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function LibraryRow({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="border-border flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <span className="text-muted-foreground shrink-0 text-[10px]">{meta}</span>
    </div>
  );
}

function SongEmptyState() {
  return (
    <CompactEmpty
      icon={AudioLines}
      title="No song imported"
      description="Audio import and beat correction arrive in Stage 7."
    />
  );
}

function CompactEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-44 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function LibraryIcon({ workspace }: { workspace: WorkspaceId }) {
  const Icon = {
    stage: Lightbulb,
    "effect-lab": Boxes,
    song: AudioLines,
    arrange: Layers3,
    live: RadioTower,
  }[workspace];
  return <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />;
}

function libraryTitle(workspace: WorkspaceId) {
  return {
    stage: "Stage groups",
    "effect-lab": "Effect catalog",
    song: "Song assets",
    arrange: "Arrangement tracks",
    live: "Live effects",
  }[workspace];
}

function fixtureCount(fixtures: number[] | { range: [number, number] }) {
  return Array.isArray(fixtures)
    ? `${fixtures.length} fixtures`
    : `${fixtures.range[1] - fixtures.range[0] + 1} fixtures`;
}
