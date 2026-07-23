export default function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{
            borderColor: "var(--line)",
            borderTopColor: "var(--amber)",
          }}
        />
        <p className="label-mono" style={{ color: "var(--paper-dim)" }}>
          Loading…
        </p>
      </div>
    </div>
  );
}