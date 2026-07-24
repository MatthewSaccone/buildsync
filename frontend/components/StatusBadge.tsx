import { Circle, Clock, TriangleAlert, Check, CheckCheck, type LucideIcon } from "lucide-react";
import type { PinStatus } from "@/lib/api";

export const STATUS_META: Record<PinStatus, { label: string; icon: LucideIcon; hex: string }> = {
  open: { label: "Open", icon: Circle, hex: "#2B5C7A" },
  in_progress: { label: "In progress", icon: Clock, hex: "#B8791A" },
  blocked: { label: "Blocked", icon: TriangleAlert, hex: "#B23A2E" },
  resolved: { label: "Resolved", icon: Check, hex: "#3F7A3F" },
  verified: { label: "Verified", icon: CheckCheck, hex: "#1F6E5C" },
};

export default function StatusBadge({ status, size = 14 }: { status: PinStatus; size?: number }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={size} aria-hidden="true" />
      {meta.label}
    </span>
  );
}