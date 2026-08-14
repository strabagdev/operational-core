import { cn } from "@/lib/utils";
import { getEntityIconOption } from "@/lib/entity-icons";

type EntityIconProps = {
  icon: string | null | undefined;
  className?: string;
};

export function EntityIcon({ icon, className }: EntityIconProps) {
  const option = getEntityIconOption(icon);

  if (!option) {
    return null;
  }

  const Icon = option.icon;

  return (
    <Icon
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
      strokeWidth={1.8}
    />
  );
}
