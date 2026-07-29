"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import {
  getProject,
  listConversations,
  getMessageThread,
  sendMessage,
  listGeneralMessages,
  sendGeneralMessage,
  listMembers,
  deleteConversation,
  connectNotificationSocket,
  connectProjectSocket,
  type Project,
  type Conversation,
  type DirectMessage,
  type ProjectMember,
} from "@/lib/api";

type Channel = "general" | number;

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

  // "general" for the project-wide channel, or a user id for a private DM.
  const [activeChannel, setActiveChannel] = useState<Channel | null>("general");
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
          setActiveChannel(Number(withParam));
        } else {
          setActiveChannel("general");
        }
      })
      .catch((err) => {
        console.error("Failed to load chat data:", err);
        setLoadError(err?.message ?? "Failed to load chat.");
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  useEffect(() => {
    if (activeChannel === null) return;
    setThreadLoading(true);

    const load =
      activeChannel === "general"
        ? listGeneralMessages(projectId)
        : getMessageThread(projectId, activeChannel);

    load.then(setThread).finally(() => setThreadLoading(false));

    // Opening a DM marks it read server-side — reflect that locally too.
    if (activeChannel !== "general") {
      setConversations((prev) =>
        prev.map((c) => (c.user.id === activeChannel ? { ...c, unread_count: 0 } : c))
      );
    }
  }, [activeChannel, projectId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const activeChannelRef = useRef<Channel | null>(null);
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // Live incoming DMs over the per-user notification socket.
  useEffect(() => {
    if (!user) return;
    const ws = connectNotificationSocket((event: any) => {
      if (event.event !== "message_created") return;
      const msg: DirectMessage = event.message;
      const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      if (otherId == null) return;

      setConversations((prev) => {
        const exists = prev.some((c) => c.user.id === otherId);
        const bumped = exists
          ? prev.map((c) =>
              c.user.id === otherId
                ? {
                    ...c,
                    last_message: msg,
                    unread_count:
                      otherId === activeChannelRef.current || msg.sender_id === user.id
                        ? c.unread_count
                        : c.unread_count + 1,
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

      if (otherId === activeChannelRef.current) {
        setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live incoming general-channel messages over the project-wide socket.
  useEffect(() => {
    if (!user || !projectId) return;
    const ws = connectProjectSocket(projectId, (event: any) => {
      if (event.event !== "general_message_created") return;
      const msg: DirectMessage = event.message;
      if (activeChannelRef.current === "general") {
        setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

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
    if (activeChannel === null || !body.trim()) return;
    setSending(true);
    try {
      if (activeChannel === "general") {
        const msg = await sendGeneralMessage(projectId, body.trim());
        setThread((prev) => [...prev, msg]);
      } else {
        const msg = await sendMessage(projectId, activeChannel, body.trim());
        setThread((prev) => [...prev, msg]);
        setConversations((prev) =>
          prev
            .map((c) => (c.user.id === activeChannel ? { ...c, last_message: msg } : c))
            .sort((a, b) => {
              const at = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
              const bt = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
              return bt - at;
            })
        );
      }
      setBody("");
      setMentionQuery(null);
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteConversation(otherUserId: number) {
    if (!confirm("Delete this entire conversation? This can't be undone.")) return;
    await deleteConversation(projectId, otherUserId);
    setConversations((prev) => prev.filter((c) => c.user.id !== otherUserId));
    if (activeChannel === otherUserId) {
      setThread([]);
      setActiveChannel("general");
    }
  }

  if (loading || !user || fetching) return <PageLoader />;

  if (loadError || !project) {
    return (
      <div className="panel p-6 text-sm" style={{ color: "var(--paper-dim)" }}>
        Couldn't load chat{loadError ? `: ${loadError}` : "."} Try refreshing the page.
      </div>
    );
  }

  const activeConvo =
    activeChannel !== "general" && activeChannel !== null
      ? conversations.find((c) => c.user.id === activeChannel)
      : undefined;
  const activeTitle = activeChannel === "general" ? "General" : activeConvo?.user.full_name;
  const mentionCandidates =
    mentionQuery !== null
      ? members
          .filter((m) => m.user.id !== user.id)
          .filter((m) => m.user.full_name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];

  return (
    <div>
        <div className="grid gap-4 md:grid-cols-[240px_1fr]" style={{ height: 560 }}>
          {/* Channel list: General (pinned, permanent) + private DMs */}
          <div className="panel flex flex-col overflow-y-auto">
            <button
              onClick={() => setActiveChannel("general")}
              className="flex items-center gap-2 px-3 py-3 text-left"
              style={{
                background: activeChannel === "general" ? "var(--ink-2)" : "transparent",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--amber)", color: "#0b1521" }}
              >
                #
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">General</p>
                <p className="truncate label-mono" style={{ color: "var(--paper-dim)" }}>
                  Everyone on this project
                </p>
              </div>
            </button>

            <p className="px-3 pt-3 pb-1 label-mono" style={{ color: "var(--paper-dim)" }}>
              Direct messages
            </p>

            {conversations.length === 0 ? (
              <p className="p-3 text-sm" style={{ color: "var(--paper-dim)" }}>
                No other members on this project yet.
              </p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.user.id}
                  className="group flex items-center justify-between gap-2 px-3 py-3"
                  style={{
                    background: activeChannel === c.user.id ? "var(--ink-2)" : "transparent",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <button
                    onClick={() => setActiveChannel(c.user.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{c.user.full_name}</p>
                    <p className="truncate label-mono">
                      {c.last_message ? c.last_message.body : "No messages yet"}
                    </p>
                  </button>
                  {c.unread_count > 0 && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
                      style={{ background: "var(--amber)", color: "#0b1521" }}
                    >
                      {c.unread_count}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(c.user.id)}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--paper-dim)" }}
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Thread */}
          <div className="panel flex flex-col overflow-hidden">
            {activeChannel === null || (activeChannel !== "general" && !activeConvo) ? (
              <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--paper-dim)" }}>
                Select a channel to start chatting.
              </div>
            ) : (
              <>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <span className="text-sm font-medium">{activeTitle}</span>
                  {/* General is permanent — no delete option shown for it */}
                  {activeChannel !== "general" && activeConvo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteConversation(activeConvo.user.id)}
                      className="label-mono"
                      style={{ color: "var(--paper-dim)" }}
                      title="Delete conversation"
                    >
                      Delete
                    </button>
                  )}
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
                              {activeChannel === "general" && !mine && (
                                <p
                                  className="label-mono mb-0.5"
                                  style={{ color: "var(--paper-dim)" }}
                                >
                                  {m.sender.full_name}
                                </p>
                              )}
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
    </div>
  );
}
