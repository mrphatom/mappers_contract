export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   "text-amber-300 border-amber-400/25 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.1)]",
    completed: "text-emerald-300 border-emerald-400/25 bg-emerald-400/10 shadow-[0_0_12px_rgba(20,241,149,0.12)]",
    cancelled: "text-rose-400 border-rose-400/25 bg-rose-400/10 shadow-[0_0_12px_rgba(244,63,94,0.1)]",
  };
  const dots: Record<string, string> = {
    pending:   "bg-amber-400",
    completed: "bg-emerald-400",
    cancelled: "bg-rose-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold tracking-wider border rounded-full uppercase backdrop-blur-sm ${styles[status] ?? "text-muted-foreground border-white/10 bg-white/5"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] ?? "bg-muted-foreground"} animate-pulse`} />
      {status}
    </span>
  );
}
