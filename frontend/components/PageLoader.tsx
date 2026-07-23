import Topbar from "@/components/Topbar";

export default function PageLoader() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span
            className="h-6 w-6 animate-spin rounded-full"
            style={{
              border: "2px solid var(--line)",
              borderTopColor: "var(--amber)",
            }}
          />
          <span className="label-mono">Loading…</span>
        </div>
      </main>
    </div>
  );
}
