"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import PageLoader from "@/components/PageLoader";
import ProjectTabs from "@/components/ProjectTabs";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listConversations,
  getMessageThread,
  sendMessage,
  listMembers,
  connectNotificationSocket,
  type Project,
  type Conversation,
  type DirectMessage,
  type ProjectMember,
} from "@/lib/api";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [fetching, setFetching] = useState(true);

  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([getProject(projectId), listConversations(projectId), listMembers(projectId)])
      .then(([p, convos, memberList]) => {
        setProject(p);
        setConversations(convos);
        setMembers(memberList);

        const withParam = searchParams.get("with");
        if (withParam) {
          setActiveUserId(Number(withParam));
        } else if (convos.length > 0) {
          setActiveUserId(convos[0].user.id);
        }
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  useEffect(() => {
    if (!activeUserId) return;
    setThreadLoading(true);
    getMessageThread(projectId, activeUserId)
      .then(setThread)
      .finally(() => setThreadLoading(false));

    // Opening a thread marks it read server-side — reflect that locally too.
    setConversations((prev) =>
      prev.map((c) => (c.user.id === activeUserId ? { ...c, unread_count: 0 } : c))
    );
  }, [activeUserId, projectId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  // Live incoming messages over the per-user notification socket.
  useEffect(() => {
    if (!user) return;
    const ws = connectNotificationSocket((event: any) => {
      if (event.event !== "message_created") return;
      const msg: DirectMessage = event.message;
      const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;

      setConversations((prev) => {
        const exists = prev.some((c) => c.user.id === otherId);
        const bumped = exists
          ? prev.map((c) =>
              c.user.id === otherId
                ? {
                    ...c,
                    last_message: msg,
                    unread_count: otherId === activeUserIdRef.current || msg.sender_id === user.id ? c.unread_count : c.unread_count + 1,
                  }
                : c
            )
          : prev;
        return [...bumped].sort((a, b) => {
          const at = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
          const bt = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
          return bt - at;
        });
      });

      if (otherId === activeUserIdRef.current) {
        setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const activeUserIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeUserIdRef.current = activeUserId;
  }, [activeUserId]);

  function handleBodyChange(value: string) {
    setBody(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const match = upToCursor.match(/@([\w.-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(name: string) {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const upToCursor = body.slice(0, cursor);
    const afterCursor = body.slice(cursor);
    const replaced = upToCursor.replace(/@([\w.-]*)$/, `@${name.split(" ")[0]} `);
    const newBody = replaced + afterCursor;
    setBody(newBody);
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeUserId || !body.trim()) return;
    setSending(true);
    try {
      const msg = await sendMessage(projectId, activeUserId, body.trim());
      setThread((prev) => [...prev, msg]);
      setConversations((prev) =>
        prev
          .map((c) => (c.user.id === activeUserId ? { ...c, last_message: msg } : c))
          .sort((a, b) => {
            const at = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
            const bt = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
            return bt - at;
          })
      );
      setBody("");
      setMentionQuery(null);
    } finally {
      setSending(false);
    }
  }

  if (loading || !user || fetching || !project) return <PageLoader />;

  const activeConvo = conversations.find((c) => c.user.id === activeUserId);
  const mentionCandidates =
    mentionQuery !== null
      ? members
          .filter((m) => m.user.id !== user.id)
          .filter((m) => m.user.full_name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <h1 className="mb-1" style={{ fontFamily: "var(--font-display)", fontSize: "1.7rem" }}>
          {project.name} — Chat
        </h1>
        <p className="label-mono mb-6">Direct messages with people on this job</p>
        <ProjectTabs projectId={projectId} />

        <div className="grid gap-4 md:grid-cols-[240px_1fr]" style={{ height: 560 }}>
          {/* Conversation list */}
          <div className="panel flex flex-col overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm" style={{ color: "var(--paper-dim)" }}>
                No other members on this project yet.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.user.id}
                  onClick={() => setActiveUserId(c.user.id)}
                  className="flex items-center justify-between gap-2 px-3 py-3 text-left"
                  style={{
                    background: activeUserId === c.user.id ? "var(--ink-2)" : "transparent",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.user.full_name}</p>
                    <p className="truncate label-mono">
                      {c.last_message ? c.last_message.body : "No messages yet"}
                    </p>
                  </div>
                  {c.unread_count > 0 && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
                      style={{ background: "var(--amber)", color: "#0b1521" }}
                    >
                      {c.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Thread */}
          <div className="panel flex flex-col overflow-hidden">
            {!activeConvo ? (
              <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--paper-dim)" }}>
                Select someone to start chatting.
              </div>
            ) : (
              <>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="text-sm font-medium">{activeConvo.user.full_name}</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {threadLoading ? (
                    <p className="label-mono">Loading…</p>
                  ) : thread.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
                      No messages yet — say hi.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {thread.map((m) => {
                        const mine = m.sender_id === user.id;
                        return (
                          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div
                              className="max-w-[75%] rounded-lg px-3 py-2 text-sm"
                              style={{
                                background: mine ? "var(--amber)" : "var(--ink-2)",
                                color: mine ? "#0b1521" : "var(--paper)",
                              }}
                            >
                              <p>{m.body}</p>
                              <p
                                className="label-mono mt-1"
                                style={{ color: mine ? "rgba(11,21,33,0.6)" : "var(--paper-dim)" }}
                              >
                                {timeLabel(m.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={threadEndRef} />
                    </div>
                  )}
                </div>

                <form onSubmit={handleSend} className="relative flex gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }}>
                  {mentionCandidates.length > 0 && (
                    <div className="panel absolute bottom-full left-3 mb-1 w-56 overflow-hidden">
                      {mentionCandidates.map((m) => (
                        <button
                          key={m.user.id}
                          type="button"
                          onClick={() => insertMention(m.user.full_name)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                        >
                          {m.user.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    className="field flex-1"
                    rows={1}
                    placeholder="Message… use @ to loop someone in"
                    value={body}
                    onChange={(e) => handleBodyChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <button type="submit" disabled={sending || !body.trim()} className="btn-primary shrink-0">
                    {sending ? "…" : "Send"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
