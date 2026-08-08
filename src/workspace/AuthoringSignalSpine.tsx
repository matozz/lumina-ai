import { Check, CircleDot, GitCommitHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DraftValidationStatus, PreviewComparison } from "@/stores/authoringDraft";

export function AuthoringSignalSpine({
  status,
  comparison,
  onComparisonChange,
}: {
  status: DraftValidationStatus;
  comparison: PreviewComparison;
  onComparisonChange: (comparison: PreviewComparison) => void;
}) {
  return (
    <div className="border-border bg-muted/20 grid gap-2 rounded-md border p-2">
      <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-1.5 text-[9px]">
        <SignalNode icon={GitCommitHorizontal} label="Saved asset" />
        <span className="bg-border h-px" />
        <SignalNode
          icon={CircleDot}
          label="Current changes"
          className={status === "invalid" ? "text-destructive" : "text-primary"}
        />
        <span className="bg-border h-px" />
        <SignalNode icon={Check} label="Verified preview" />
      </div>
      <div className="flex items-center gap-1.5">
        <Badge variant={status === "invalid" ? "destructive" : "secondary"}>
          {statusLabel(status)}
        </Badge>
        <div className="ml-auto flex" aria-label="A/B preview source">
          <Button
            size="xs"
            variant={comparison === "pinned" ? "secondary" : "ghost"}
            className="rounded-r-none"
            aria-pressed={comparison === "pinned"}
            onClick={() => onComparisonChange("pinned")}
          >
            A · saved
          </Button>
          <Button
            size="xs"
            variant={comparison === "working" ? "secondary" : "ghost"}
            className="rounded-l-none"
            aria-pressed={comparison === "working"}
            onClick={() => onComparisonChange("working")}
          >
            B · verified
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignalNode({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof Check;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("text-muted-foreground flex items-center gap-1", className)}>
      <Icon className="size-3" aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

function statusLabel(status: DraftValidationStatus) {
  return {
    pristine: "Saved",
    dirty: "Needs validation",
    validating: "Validating…",
    valid: "Preview safe",
    invalid: "Invalid · preview held",
  }[status];
}
