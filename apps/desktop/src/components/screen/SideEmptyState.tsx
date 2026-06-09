import { IconGrid } from "@/components/icons";
import { EmptyMessage } from "./EmptyMessage";

export function SideEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyMessage
      icon={icon ?? <IconGrid size={18} strokeWidth={1.6} />}
      title={title}
      description={description}
      onClick={onAction}
    />
  );
}
