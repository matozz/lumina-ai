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
import type { AutomationParameterOption } from "../automationParameters";
import { parameterUnit, parameterValueType } from "@/document/effectParameter";

interface AutomationParameterMenuProps {
  label: string;
  options: AutomationParameterOption[];
  onSelect: (option: AutomationParameterOption) => void;
  compact?: boolean;
}

export const AutomationParameterMenu = ({
  label,
  options,
  onSelect,
  compact = false,
}: AutomationParameterMenuProps) => {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? "icon-xs" : "sm"}
            aria-label={compact ? label : undefined}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Plus data-icon={compact ? undefined : "inline-start"} />
            {!compact && label}
          </Button>
        }
      />
      <PopoverContent
        side="right"
        align="start"
        className="w-64"
        onClick={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>Add automation lane</PopoverTitle>
          <PopoverDescription>
            Select a typed parameter. Existing targets are hidden.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {options.map((option) => (
            <Button
              key={`${option.target.scope}:${option.definition.id}`}
              variant="ghost"
              className="h-auto justify-start py-2 text-left"
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-xs">{option.definition.name}</span>
                <span className="text-muted-foreground text-[10px]">
                  {parameterValueType(option.definition)} · {parameterUnit(option.definition)}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
