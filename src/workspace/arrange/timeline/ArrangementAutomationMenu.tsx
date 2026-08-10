import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ArrangementAutomationOption } from "./arrangementTimelineModel";
import { parameterAutomation, parameterValueType } from "@/document/effectParameter";

export function ArrangementAutomationMenu({
  options,
  onSelect,
}: {
  options: ArrangementAutomationOption[];
  onSelect: (option: ArrangementAutomationOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground size-6 shrink-0"
            disabled={options.length === 0}
            aria-label="Add typed Arrangement automation lane"
          >
            <Plus className="size-3" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent side="right" align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Add typed automation</PopoverTitle>
          <PopoverDescription>
            Targets come from the Cue's Effects. Controls already automated elsewhere are hidden.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {options.map((option) => (
            <Button
              key={targetKey(option)}
              variant="ghost"
              className="h-auto justify-start py-2 text-left"
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-xs">{option.label}</span>
                <span className="text-muted-foreground text-[10px]">
                  {parameterValueType(option.definition)} · {parameterAutomation(option.definition)}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function targetKey(option: ArrangementAutomationOption) {
  const target = option.target;
  return target.scope === "global"
    ? `global:${target.parameter_id}`
    : `${target.clip_id}:${target.layer_id}:${target.parameter_id}`;
}
