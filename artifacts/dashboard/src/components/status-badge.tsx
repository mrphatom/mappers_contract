export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    completed: "text-primary border-primary/30 bg-primary/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium tracking-widest border uppercase ${styles[status] ?? "text-muted-foreground border-border bg-muted"}`}
    >
      {status}
    </span>
  );
}
