"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  listProjects,
  listMembers,
  listMySchedule,
  listTasks,
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  ApiError,
  type Project,
  type ProjectMember,
  type ScheduledJob,
  type Task,
  type UserRole,
} from "@/lib/api";

type ViewMode = "day" | "week" | "month";

const TRADES: { value: UserRole; label: string; color: string }[] = [
  { value: "architect", label: "Architect", color: "#8b5cf6" },
  { value: "builder", label: "Builder", color: "#d97706" },
  { value: "general_contractor", label: "General contractor", color: "#d9541f" },
  { value: "electrician", label: "Electrician", color: "#eab308" },
  { value: "plumber", label: "Plumber", color: "#3b82f6" },
  { value: "hvac", label: "HVAC", color: "#06b6d4" },
  { value: "framer", label: "Framer", color: "#a16207" },
  { value: "owner", label: "Owner", color: "#64748b" },
  { value: "other", label: "Other", color: "#6b7280" },
];

function tradeColor(trade: UserRole | null): string {
  return TRADES.find((t) => t.value === trade)?.color ?? "#6b7280";
}

function tradeLabel(trade: UserRole | null): string {
  return TRADES.find((t) => t.value === trade)?.label ?? "Unassigned trade";
}

// ---- date helpers ----
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const copy = new Date(date);
  copy.setHours(h, m, 0, 0);
  return copy;
}
function toLocalInputDate(d: Date): string {
  return dateKey(d);
}
function toLocalInputTime(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

// ---- weather (best-effort, client-side, no API key) ----
interface DayWeather {
  code: number;
  tmax: number;
  tmin: number;
}
const WEATHER_ICON: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "🌨️",
  80: "🌦️",
  81: "🌧️",
  82: "⛈️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};
function weatherIcon(code: number | undefined): string {
  if (code === undefined) return "";
  return WEATHER_ICON[code] ?? "🌡️";
}

async function fetchWeatherForAddress(address: string): Promise<Record<string, DayWeather> | null> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(address)}`
    );
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) return null;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`
    );
    const wx = await wxRes.json();
    const days: Record<string, DayWeather> = {};
    wx?.daily?.time?.forEach((d: string, i: number) => {
      days[d] = {
        code: wx.daily.weathercode[i],
        tmax: Math.round(wx.daily.temperature_2m_max[i]),
        tmin: Math.round(wx.daily.temperature_2m_min[i]),
      };
    });
    return days;
  } catch {
    return null; // weather is a nice-to-have; never block the calendar on it
  }
}

interface JobFormState {
  id: number | null;
  project_id: number | "";
  title: string;
  trade: UserRole | "";
  assigned_to_id: number | "";
  depends_on_id: number | "";
  task_id: number | "";
  date: string;
  start: string;
  end: string;
}

const EMPTY_FORM: JobFormState = {
  id: null,
  project_id: "",
  title: "",
  trade: "",
  assigned_to_id: "",
  depends_on_id: "",
  task_id: "",
  date: toLocalInputDate(new Date()),
  start: "08:00",
  end: "12:00",
};

export default function SchedulePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [membersByProject, setMembersByProject] = useState<Record<number, ProjectMember[]>>({});
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [fetching, setFetching] = useState(true);
  const [weather, setWeather] = useState<Record<number, Record<string, DayWeather>>>({});

  // Tasks for whichever project is currently selected in the form — fetched
  // on demand rather than for every project up front, since the task list
  // is only needed while the form is open.
  const [tasksForFormProject, setTasksForFormProject] = useState<Task[]>([]);

  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [siteFilter, setSiteFilter] = useState<number | "all">("all");
  const [tradeFilter, setTradeFilter] = useState<UserRole | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<JobFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragJobId, setDragJobId] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    listProjects()
      .then(async (ps) => {
        setProjects(ps);
        const entries = await Promise.all(
          ps.map(async (p) => [p.id, await listMembers(p.id).catch(() => [])] as const)
        );
        setMembersByProject(Object.fromEntries(entries));
      })
      .finally(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    listMySchedule()
      .then(setJobs)
      .finally(() => setFetching(false));
  }, [user]);

  // best-effort weather per project address, fetched once projects load
  useEffect(() => {
    projects.forEach((p) => {
      if (!p.address || weather[p.id]) return;
      fetchWeatherForAddress(p.address).then((days) => {
        if (days) setWeather((prev) => ({ ...prev, [p.id]: days }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Load the task list for the form's currently-selected project, whenever
  // that selection changes while the form is open.
  useEffect(() => {
    if (!formOpen || !form.project_id) {
      setTasksForFormProject([]);
      return;
    }
    listTasks(form.project_id)
      .then(setTasksForFormProject)
      .catch(() => setTasksForFormProject([]));
  }, [formOpen, form.project_id]);

  const membersForSite = useMemo(() => {
    if (siteFilter === "all") {
      // union of all members across projects, deduped by user id
      const map = new Map<number, ProjectMember>();
      Object.values(membersByProject)
        .flat()
        .forEach((m) => map.set(m.user_id, m));
      return Array.from(map.values());
    }
    return membersByProject[siteFilter] ?? [];
  }, [siteFilter, membersByProject]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (siteFilter !== "all" && j.project_id !== siteFilter) return false;
      if (tradeFilter !== "all" && j.trade !== tradeFilter) return false;
      return true;
    });
  }, [jobs, siteFilter, tradeFilter]);

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  function jobsOnDay(d: Date): ScheduledJob[] {
    return filteredJobs
      .filter((j) => sameDay(new Date(j.start_time), d))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  function openCreateForm(defaultDate?: Date) {
    setFormError(null);
    setForm({
      ...EMPTY_FORM,
      project_id: siteFilter !== "all" ? siteFilter : projects[0]?.id ?? "",
      date: toLocalInputDate(defaultDate ?? anchor),
    });
    setFormOpen(true);
  }

  function openEditForm(job: ScheduledJob) {
    setFormError(null);
    const start = new Date(job.start_time);
    const end = new Date(job.end_time);
    setForm({
      id: job.id,
      project_id: job.project_id,
      title: job.title,
      trade: job.trade ?? "",
      assigned_to_id: job.assigned_to_id ?? "",
      depends_on_id: job.depends_on_id ?? "",
      task_id: job.task_id ?? "",
      date: toLocalInputDate(start),
      start: toLocalInputTime(start),
      end: toLocalInputTime(end),
    });
    setFormOpen(true);
  }

  async function refetch() {
    const fresh = await listMySchedule();
    setJobs(fresh);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project_id) {
      setFormError("Pick a job site.");
      return;
    }
    const date = new Date(`${form.date}T00:00:00`);
    const start = combineDateAndTime(date, form.start);
    const end = combineDateAndTime(date, form.end);
    if (end <= start) {
      setFormError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title,
        trade: form.trade || null,
        assigned_to_id: form.assigned_to_id === "" ? null : Number(form.assigned_to_id),
        depends_on_id: form.depends_on_id === "" ? null : Number(form.depends_on_id),
        task_id: form.task_id === "" ? null : Number(form.task_id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      };
      if (form.id) {
        await updateScheduledJob(form.project_id, form.id, payload);
      } else {
        await createScheduledJob(form.project_id, payload);
      }
      setFormOpen(false);
      await refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save that job.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id || !form.project_id) return;
    if (!confirm("Remove this job from the schedule?")) return;
    setSaving(true);
    try {
      await deleteScheduledJob(form.project_id, form.id);
      setFormOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  async function moveJobToDate(job: ScheduledJob, newDate: Date) {
    const oldStart = new Date(job.start_time);
    const oldEnd = new Date(job.end_time);
    const newStart = combineDateAndTime(newDate, toLocalInputTime(oldStart));
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    // optimistic update
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id ? { ...j, start_time: newStart.toISOString(), end_time: newEnd.toISOString() } : j
      )
    );
    try {
      await updateScheduledJob(job.project_id, job.id, {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      });
    } catch {
      await refetch(); // roll back to server truth if the drag-drop save failed
    }
  }

  function dependencyWarning(job: ScheduledJob): string | null {
    if (!job.depends_on_id) return null;
    const dep = jobsById.get(job.depends_on_id);
    if (!dep) return null;
    if (dep.status !== "done") {
      return `Depends on "${dep.title}" — not marked done yet`;
    }
    if (new Date(dep.end_time) > new Date(job.start_time)) {
      return `Depends on "${dep.title}", which isn't scheduled to finish until after this starts`;
    }
    return null;
  }

  if (loading || !user) return <PageLoader />;

  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthGridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));

  function stepAnchor(dir: 1 | -1) {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  }

  function JobCard({ job, compact = false }: { job: ScheduledJob; compact?: boolean }) {
    const warning = dependencyWarning(job);
    return (
      <div
        draggable
        onDragStart={() => setDragJobId(job.id)}
        onDragEnd={() => setDragJobId(null)}
        onClick={() => openEditForm(job)}
        className="cursor-pointer rounded-sm px-2 py-1.5 text-xs"
        style={{
          background: "var(--ink)",
          borderLeft: `3px solid ${tradeColor(job.trade)}`,
          opacity: dragJobId === job.id ? 0.4 : 1,
        }}
        title={warning ?? undefined}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="label-mono">
            {toLocalInputTime(new Date(job.start_time))}–{toLocalInputTime(new Date(job.end_time))}
          </span>
          {warning && <span style={{ color: "var(--red)" }}>⚠</span>}
        </div>
        <p className="truncate font-medium">{job.title}</p>
        {!compact && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1" style={{ color: "var(--paper-dim)" }}>
            {job.assignee_name && <span>{job.assignee_name}</span>}
            {siteFilter === "all" && job.project_name && <span>· {job.project_name}</span>}
            {job.task_title && (
              <span
                className="label-mono rounded-sm px-1"
                style={{ border: "1px solid var(--line-soft)", color: "var(--amber)" }}
              >
                ✓ {job.task_title}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  function DayColumn({ date }: { date: Date }) {
    const dayJobs = jobsOnDay(date);
    const wx = siteFilter !== "all" ? weather[siteFilter as number]?.[dateKey(date)] : undefined;
    const isToday = sameDay(date, new Date());
    return (
      <div
        className="panel flex min-h-[180px] flex-col gap-1.5 p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const job = dragJobId !== null ? jobsById.get(dragJobId) : null;
          if (job) moveJobToDate(job, date);
        }}
        style={isToday ? { borderColor: "var(--amber)" } : undefined}
      >
        <div className="mb-1 flex items-center justify-between">
          <div>
            <p className="label-mono">{date.toLocaleDateString(undefined, { weekday: "short" })}</p>
            <p className="text-sm font-medium">{date.getDate()}</p>
          </div>
          {wx && (
            <span className="text-xs" style={{ color: "var(--paper-dim)" }}>
              {weatherIcon(wx.code)} {wx.tmax}°/{wx.tmin}°
            </span>
          )}
        </div>
        {dayJobs.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
        <button
          onClick={() => openCreateForm(date)}
          className="label-mono mt-auto self-start"
          style={{ color: "var(--amber)" }}
        >
          + Add
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>Schedule</h1>
            <p className="label-mono mt-1">Across every project you're part of</p>
          </div>
          <button onClick={() => openCreateForm()} className="btn-primary">
            + Schedule a job
          </button>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => stepAnchor(-1)} className="btn-ghost px-2">
              ←
            </button>
            <button onClick={() => setAnchor(new Date())} className="btn-ghost text-sm">
              Today
            </button>
            <button onClick={() => stepAnchor(1)} className="btn-ghost px-2">
              →
            </button>
            <span className="label-mono ml-2">
              {view === "month"
                ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                : view === "week"
                ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(
                    weekStart,
                    6
                  ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field text-sm"
              style={{ width: "auto" }}
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All sites</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="field text-sm"
              style={{ width: "auto" }}
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value as UserRole | "all")}
            >
              <option value="all">All trades</option>
              {TRADES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-sm" style={{ border: "1px solid var(--line)" }}>
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="label-mono px-3 py-1.5 capitalize"
                  style={{
                    background: view === v ? "var(--amber)" : "transparent",
                    color: view === v ? "#ffffff" : "var(--paper-dim)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {fetching ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel h-16 animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : (
          <>
            {view === "week" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {weekDays.map((d) => (
                  <DayColumn key={dateKey(d)} date={d} />
                ))}
              </div>
            )}

            {view === "day" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {membersForSite.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                    No members to show yet — add people to a project first.
                  </p>
                ) : (
                  membersForSite.map((m) => {
                    const dayJobs = jobsOnDay(anchor).filter((j) => j.assigned_to_id === m.user_id);
                    if (dayJobs.length === 0) return null;
                    return (
                      <div
                        key={m.user_id}
                        className="panel flex flex-col gap-2 p-3"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const job = dragJobId !== null ? jobsById.get(dragJobId) : null;
                          if (job) moveJobToDate(job, anchor);
                        }}
                      >
                        <p className="font-medium">{m.user.full_name}</p>
                        <div className="flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "0.5rem" }}>
                          {dayJobs.map((j) => (
                            <JobCard key={j.id} job={j} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
                {jobsOnDay(anchor).length === 0 && (
                  <div className="panel px-6 py-16 text-center sm:col-span-2 lg:col-span-3" style={{ color: "var(--paper-dim)" }}>
                    Nothing scheduled for this day.
                  </div>
                )}
                <button onClick={() => openCreateForm(anchor)} className="label-mono self-start" style={{ color: "var(--amber)" }}>
                  + Add job to this day
                </button>
              </div>
            )}

            {view === "month" && (
              <div className="grid grid-cols-7 gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="label-mono px-1 pb-1 text-center">
                    {d}
                  </div>
                ))}
                {monthDays.map((d) => {
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const dayJobs = jobsOnDay(d);
                  return (
                    <div
                      key={dateKey(d)}
                      className="panel flex min-h-[90px] flex-col gap-1 p-1.5"
                      style={{ opacity: inMonth ? 1 : 0.4 }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const job = dragJobId !== null ? jobsById.get(dragJobId) : null;
                        if (job) moveJobToDate(job, d);
                      }}
                      onClick={() => {
                        setAnchor(d);
                        setView("day");
                      }}
                    >
                      <span className="label-mono">{d.getDate()}</span>
                      {dayJobs.slice(0, 3).map((j) => (
                        <div
                          key={j.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDragJobId(j.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(j);
                          }}
                          className="truncate rounded-sm px-1 py-0.5 text-[11px]"
                          style={{ borderLeft: `2px solid ${tradeColor(j.trade)}`, background: "var(--ink)" }}
                        >
                          {j.title}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <span className="label-mono" style={{ color: "var(--paper-dim)" }}>
                          +{dayJobs.length - 3} more
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-3">
          {TRADES.map((t) => (
            <span key={t.value} className="label-mono flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
      </main>

      {/* Create / edit modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setFormOpen(false)}
        >
          <form
            onSubmit={handleFormSubmit}
            onClick={(e) => e.stopPropagation()}
            className="panel-raised flex w-full max-w-md flex-col gap-3 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {form.id ? "Edit scheduled job" : "Schedule a job"}
              </h2>
              <button type="button" onClick={() => setFormOpen(false)} className="label-mono">
                ✕
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              Job site
              <select
                className="field"
                value={form.project_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    project_id: Number(e.target.value),
                    assigned_to_id: "",
                    depends_on_id: "",
                    task_id: "",
                  }))
                }
                required
              >
                <option value="" disabled>
                  Select a project…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Title
              <input
                className="field"
                placeholder="e.g. Pour foundation"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Trade
                <select
                  className="field"
                  value={form.trade}
                  onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value as UserRole }))}
                >
                  <option value="">—</option>
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Assigned to
                <select
                  className="field"
                  value={form.assigned_to_id}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_to_id: e.target.value === "" ? "" : Number(e.target.value) }))}
                >
                  <option value="">Unassigned</option>
                  {(membersByProject[form.project_id as number] ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              Related task
              <select
                className="field"
                value={form.task_id}
                onChange={(e) => setForm((f) => ({ ...f, task_id: e.target.value === "" ? "" : Number(e.target.value) }))}
              >
                <option value="">No related task</option>
                {tasksForFormProject.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Depends on
              <select
                className="field"
                value={form.depends_on_id}
                onChange={(e) => setForm((f) => ({ ...f, depends_on_id: e.target.value === "" ? "" : Number(e.target.value) }))}
              >
                <option value="">No dependency</option>
                {jobs
                  .filter((j) => j.project_id === form.project_id && j.id !== form.id)
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({new Date(j.start_time).toLocaleDateString()})
                    </option>
                  ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Date
                <input
                  type="date"
                  className="field"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Start
                <input
                  type="time"
                  className="field"
                  value={form.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                End
                <input
                  type="time"
                  className="field"
                  value={form.end}
                  onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                  required
                />
              </label>
            </div>

            {formError && (
              <p className="text-sm" style={{ color: "var(--red)" }}>
                {formError}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between">
              {form.id ? (
                <button type="button" onClick={handleDelete} className="label-mono" style={{ color: "var(--red)" }}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : form.id ? "Save changes" : "Schedule job"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
