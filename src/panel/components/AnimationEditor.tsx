import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FromTo } from "@/bridge/types";

interface AnimationEditorProps {
  fromValue: FromTo;
  toValue: FromTo;
  easing: string;
  onSave: (from: FromTo, to: FromTo, easing: string) => void;
}

export const AnimationEditor = (props: AnimationEditorProps) => {
  const { fromValue, toValue, easing: initialEasing, onSave } = props;

  const [fromInput, setFromInput] = useState(String(fromValue));
  const [toInput, setToInput] = useState(String(toValue));
  const [easingInput, setEasingInput] = useState(initialEasing);

  const handleSave = () => {
    // Try to parse as numbers
    const parsedFrom = Number(fromInput);
    const finalFrom = isNaN(parsedFrom) ? fromInput : parsedFrom;

    const parsedTo = Number(toInput);
    const finalTo = isNaN(parsedTo) ? toInput : parsedTo;

    onSave(finalFrom, finalTo, easingInput);
  };

  return (
    <div onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-300">Animation Properties</h3>
      </div>

      <div className="flex flex-col gap-3 py-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-zinc-400">From Value</Label>
          <Input type="text" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-zinc-400">To Value</Label>
          <Input type="text" value={toInput} onChange={(e) => setToInput(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-zinc-400">Easing</Label>
          <Select
            value={easingInput}
            onValueChange={(v) => {
              if (v) setEasingInput(v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select easing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="ease_in">Ease In</SelectItem>
              <SelectItem value="ease_out">Ease Out</SelectItem>
              <SelectItem value="ease_in_out">Ease In/Out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end border-t border-zinc-800 pt-2">
        <Button onClick={handleSave} className="h-8 w-full" size="sm">
          <Check size={12} /> Apply Changes
        </Button>
      </div>
    </div>
  );
};
