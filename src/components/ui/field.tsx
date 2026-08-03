import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />;
}

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "flex gap-1.5 data-[orientation=horizontal]:items-center data-[orientation=horizontal]:justify-between data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label className={cn("text-[10px]", className)} {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground text-[10px] leading-relaxed", className)} {...props} />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-xs font-medium", className)} {...props} />;
}

export { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle };
