import { useEffect, useState } from "react";
import { Grid3X3, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { activeStage } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";

export function ProjectStageInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const matrix = stage.layout.generator.shape === "matrix" ? stage.layout.generator : null;
  const [rows, setRows] = useState(matrix?.rows ?? 1);
  const [columns, setColumns] = useState(matrix?.columns ?? 1);
  const [spacing, setSpacing] = useState(matrix?.spacing ?? 64);

  useEffect(() => {
    if (!matrix) return;
    setRows(matrix.rows);
    setColumns(matrix.columns);
    setSpacing(matrix.spacing);
  }, [matrix]);

  const apply = () => {
    if (!matrix || rows < 1 || columns < 1 || spacing <= 0) return;
    if (bundle.cues.length > 0) {
      workspaceActions.setPublishStatus(
        "error",
        "Stage topology changes require an explicit Cue Stage-revision upgrade.",
      );
      return;
    }
    const count = rows * columns;
    projectActions.updateStage("Update Stage matrix", (draft) => {
      draft.patch = [{ profile_id: "generic-rgb", id_range: [1, count] }];
      draft.layout = {
        type: "generator",
        generator: { shape: "matrix", rows, columns, spacing, origin: [0, 0] },
      };
      draft.groups = [
        {
          id: "all-fixtures",
          name: "All fixtures",
          fixtures: { range: [1, count] },
          sort_by: "none",
        },
      ];
      draft.target_sets = [
        { id: "all", name: "All", selector: { type: "all" } },
        {
          id: "rows",
          name: "Rows",
          selector: { type: "rows", indices: Array.from({ length: rows }, (_, index) => index) },
        },
        {
          id: "columns",
          name: "Columns",
          selector: {
            type: "columns",
            indices: Array.from({ length: columns }, (_, index) => index),
          },
        },
        {
          id: "zones-3x3",
          name: "3×3 Zones",
          selector: {
            type: "grid_zones",
            rows: 3,
            columns: 3,
            zones: Array.from({ length: 9 }, (_, index) => ({
              row: Math.floor(index / 3),
              column: index % 3,
            })),
          },
        },
        {
          id: "checkerboard",
          name: "Checkerboard",
          selector: { type: "checkerboard", parity: "even" },
        },
      ];
    });
    workspaceActions.setPublishStatus("idle", `${rows}×${columns} Stage saved to Draft.`);
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Stage inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Grid3X3 className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Stage setup</span>
        <Badge variant="outline" className="ml-auto">
          r{stage.revision}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <FieldGroup>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="stage-rows">Rows</FieldLabel>
                <Input
                  id="stage-rows"
                  type="number"
                  min={1}
                  max={1000}
                  value={rows}
                  onChange={(event) => setRows(Number(event.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="stage-columns">Columns</FieldLabel>
                <Input
                  id="stage-columns"
                  type="number"
                  min={1}
                  max={1000}
                  value={columns}
                  onChange={(event) => setColumns(Number(event.target.value))}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="stage-spacing">Fixture spacing</FieldLabel>
              <Input
                id="stage-spacing"
                type="number"
                min={0.01}
                value={spacing}
                onChange={(event) => setSpacing(Number(event.target.value))}
              />
              <FieldDescription>
                Patch, Layout, Fixture Groups and TargetSets remain owned by this Stage revision.
              </FieldDescription>
            </Field>
            <Button size="sm" onClick={apply}>
              <Save data-icon="inline-start" aria-hidden="true" />
              Apply {rows}×{columns} Stage
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Fixtures" value={String(rows * columns)} />
              <Metric label="TargetSets" value={String(stage.target_sets.length)} />
            </div>
          </FieldGroup>
        </div>
      </ScrollArea>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-md border p-2">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
