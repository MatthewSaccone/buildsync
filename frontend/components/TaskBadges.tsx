import { Circle, Loader2, TriangleAlert, CheckCheck, ArrowDown, Minus, ArrowUp, Flame, type LucideIcon } from "lucide-react";
import type { TaskStatus, PinPriority } from "@/lib/api";

export const TASK_STATUS_META: Record<string, { label: string; icon: LucideIcon; hex: string }> = {
  todo: { label: "To do", icon: Circle, hex: "#2B5C7A" },
  in_progress: { label: "In progress", icon: Loader2, hex: "#B8791A" },
  blocked: { label: "Blocked", icon: TriangleAlert, hex: "#B23A2E" },
  done: { label: "Done", icon: CheckCheck, hex: "#3F7A3F" },
};

export function TaskStatusBadge({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.todo;
  const Icon = meta.icon;
  return (
    <span
      className="label-mono inline-flex items-center gap-1"
      style={{ color: meta.hex }}
    >
      <Icon size={size} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export const PRIORITY_META: Record<string, { label: string; icon: LucideIcon; hex: string }> = {
  low: { label: "Low", icon: ArrowDown, hex: "#5B6B73" },
  normal: { label: "Normal", icon: Minus, hex: "#2B5C7A" },
  high: { label: "High", icon: ArrowUp, hex: "#B8791A" },
  urgent: { label: "Urgent", icon: Flame, hex: "#B23A2E" },
};

export function PriorityBadge({ priority, size = 14 }: { priority: PinPriority; size?: number }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  const Icon = meta.icon;
  return (
    <span
      className="label-mono inline-flex items-center gap-1"
      style={{ color: meta.hex }}
    >
      <Icon size={size} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
