import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspacePanelHeaderProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function WorkspacePanelHeader({
  icon: Icon,
  title,
  children,
  className,
  iconClassName,
}: WorkspacePanelHeaderProps) {
  return (
    <div
      className={cn(
        "border-border bg-card/80 flex h-8 min-w-0 shrink-0 items-center gap-1.5 overflow-hidden border-b px-2.5",
        "[&_[data-slot=badge]]:h-[18px] [&_[data-slot=badge]]:px-1.5 [&_[data-slot=badge]]:text-[9px]",
        className,
      )}
      data-layout-region="panel-header"
    >
      <Icon
        className={cn("text-muted-foreground size-3.5 shrink-0", iconClassName)}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="text-foreground/90 shrink-0 text-[11px] leading-none font-semibold tracking-[0.01em]">
        {title}
      </span>
      {children}
    </div>
  );
}
