import { useEffect, useState } from "react";
import { Eye, Plus, Trash2, UsersRound } from "lucide-react";
import type { FixtureFramePayload, FullDSL, GroupDSL, SortByDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { engineActions } from "@/stores/engine";
import {
  fixtureIdsBySpatialFilter,
  fixtureIdsForPatch,
  groupFixtureIds,
  type SpatialFilter,
  uniqueGroupId,
} from "./stageSetup";

const sortOptions: Array<{ value: SortByDSL; label: string }> = [
  { value: "none", label: "Fixture ID" },
  { value: "x", label: "Left → right" },
  { value: "-x", label: "Right → left" },
  { value: "y", label: "Top → bottom" },
  { value: "-y", label: "Bottom → top" },
  { value: "distance_center", label: "Center → edge" },
];

export function StageGroupEditor({ document }: { document: FullDSL }) {
  const [name, setName] = useState("Front wash");
  const [filter, setFilter] = useState<SpatialFilter>("top");
  const [sortBy, setSortBy] = useState<SortByDSL>("x");
  const [testingGroupId, setTestingGroupId] = useState<string | null>(null);
  const fixtureIds = fixtureIdsForPatch(document.patch);

  useEffect(
    () => () => {
      previewGroup(document, null);
    },
    [document],
  );

  const replaceGroups = (groups: GroupDSL[], label: string) => {
    engineActions.applyDocumentTransaction({
      id: crypto.randomUUID(),
      label,
      commands: [
        {
          type: "replace_stage_setup",
          patch: document.patch,
          layout: document.layout,
          groups,
        },
      ],
    });
  };

  const addGroup = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const fixtures = fixtureIdsBySpatialFilter(document.layout, fixtureIds, filter);
    replaceGroups(
      [
        ...document.groups,
        {
          id: uniqueGroupId(trimmedName, document.groups),
          name: trimmedName,
          fixtures,
          sort_by: sortBy,
        },
      ],
      `Create group ${trimmedName}`,
    );
  };

  const deleteGroup = (groupId: string) => {
    replaceGroups(
      document.groups.filter((group) => group.id !== groupId),
      "Delete fixture group",
    );
  };

  return (
    <section className="border-border flex flex-col gap-2 rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <UsersRound className="text-primary size-3.5" aria-hidden="true" />
        <h2 className="text-xs font-semibold">Fixture groups</h2>
      </div>

      <div className="flex flex-col gap-1.5">
        {document.groups.map((group) => (
          <div key={group.id} className="bg-background/40 flex items-center gap-1 rounded-md p-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">{group.name}</p>
              <p className="text-muted-foreground text-[10px]">
                {groupFixtureIds(group).length} fixtures · {group.sort_by ?? "none"}
              </p>
            </div>
            <Button
              variant={testingGroupId === group.id ? "secondary" : "ghost"}
              size="icon-xs"
              aria-label={
                testingGroupId === group.id ? `Stop testing ${group.name}` : `Test ${group.name}`
              }
              aria-pressed={testingGroupId === group.id}
              onClick={() => {
                const nextGroupId = testingGroupId === group.id ? null : group.id;
                setTestingGroupId(nextGroupId);
                previewGroup(document, nextGroupId === null ? null : group);
              }}
            >
              <Eye aria-hidden="true" />
            </Button>
            {group.id !== "all-fixtures" && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${group.name}`}
                title={
                  groupIsReferenced(document, group.id)
                    ? "This group is targeted by an effect and cannot be deleted."
                    : undefined
                }
                disabled={groupIsReferenced(document, group.id)}
                onClick={() => deleteGroup(group.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Label htmlFor="stage-group-name" className="text-[10px]">
        New group
      </Label>
      <Input id="stage-group-name" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={filter}
          onValueChange={(value) => value && setFilter(value as SpatialFilter)}
        >
          <SelectTrigger size="sm" aria-label="Spatial filter" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All fixtures</SelectItem>
              <SelectItem value="left">Left half</SelectItem>
              <SelectItem value="right">Right half</SelectItem>
              <SelectItem value="top">Top half</SelectItem>
              <SelectItem value="bottom">Bottom half</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => value && setSortBy(value as SortByDSL)}>
          <SelectTrigger size="sm" aria-label="Group sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Button variant="secondary" size="sm" onClick={addGroup} disabled={!name.trim()}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        Create group
      </Button>
    </section>
  );
}

function groupIsReferenced(document: FullDSL, groupId: string) {
  return document.effect_instances.some((instance) => instance.target_group_id === groupId);
}

function previewGroup(document: FullDSL, group: GroupDSL | null) {
  const fixtureIds = new Set(group ? groupFixtureIds(group) : []);
  const outputs: FixtureFramePayload[] = fixtureIdsForPatch(document.patch).map((id) => ({
    id,
    profile_id:
      document.patch.find((item) => id >= item.id_range[0] && id <= item.id_range[1])?.profile_id ??
      "generic-rgb",
    attributes: [
      { id: "intensity", value: { type: "scalar", value: fixtureIds.has(id) ? 1 : 0 } },
      {
        id: "color.rgb",
        value: { type: "color", value: fixtureIds.has(id) ? [255, 255, 255] : [0, 0, 0] },
      },
    ],
  }));
  window.dispatchEvent(new CustomEvent("workspace:test-fixtures", { detail: outputs }));
}
