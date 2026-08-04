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
  listChannels,
  searchChannels,
  createChannel,
  renameChannel,
  archiveChannel,
  listChannelMessages,
  sendChannelMessage,
  listMembers,
  clearConversation,
  connectNotificationSocket,
  connectProjectSocket,
  type Project,
  type Conversation,
  type DirectMessage,
  type ProjectMember,
  type Channel,
  type ChannelMessage,
} from "@/lib/api";

type ActiveTarget = { kind: "channel"; id: number } | { kind: "dm"; id: number } | null;
type ThreadMessage = DirectMessage | ChannelMessage;

// Common construction-project channel names, offered as quick-add presets
// so people aren't stuck typing the same handful of channel names every project.
const PRESET_CHANNEL_NAMES = [
  "Announcements",
  "Site Safety",
  "Scheduling",
  "Materials & Deliveries",
  "Budget & Costs",
  "Inspections",
  "Client Updates",
];

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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [fetching, setFetching] = useState(true);

  const [activeTarget, setActiveTarget] = useState<ActiveTarget>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create/rename/archive/search channel UI state
  const [channelSearch, setChannelSearch] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [renamingChannelId, setRenamingChannelId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelNotice, setChannelNotice] = useState<string | null>(null);

  // New DM picker
  const [showNewDm, setShowNewDm] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  function loadChannels() {
    return listChannels(projectId).then(setChannels);
  }

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([
      getProject(projectId),
      listConversations(projectId),
      listMembers(projectId),
      listChannels(projectId),
    ])
      .then(([p, convos, memberList, channelList]) => {
        setProject(p);
        setConversations(convos);
        setMembers(memberList);
        setChannels(channelList);

        const withParam = searchParams.get("with");
        if (withParam) {
          setActiveTarget({ kind: "dm", id: Number(withParam) });
        } else {
          const general = channelList.find((c) => c.is_general);
          setActiveTarget(general ? { kind: "channel", id: general.id } : null);
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
    if (!user || !projectId) return;
    if (!channelSearch.trim()) {
      loadChannels();
      return;
    }
    const handle = setTimeout(() => {
      searchChannels(projectId, channelSearch.trim())
        .then(setChannels)
        .catch((err) => console.error("Channel search failed:", err));
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSearch, projectId, user]);

  useEffect(() => {
    if (channelNotice) {
      const t = setTimeout(() => setChannelNotice(null), 4000);
      return () => clearTimeout(t);
    }
  }, [channelNotice]);

  useEffect(() => {
    if (activeTarget === null) return;
    const target = activeTarget;
    let cancelled = false;

    async function loadThread() {
      setThreadLoading(true);
      setThread([]);
      try {
        const messages =
          target.kind === "channel"
            ? await listChannelMessages(projectId, target.id)
            : await getMessageThread(projectId, target.id);
        if (!cancelled) setThread(messages);
      } catch (err) {
        console.error("Failed to load messages:", err);
        if (!cancelled) setThread([]);
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    }
    loadThread();

    if (target.kind === "dm") {
      setConversations((prev) =>
        prev.map((c) => (c.user.id === target.id ? { ...c, unread_count: 0 } : c))
      );
    } else {
      setChannels((prev) => prev.map((c) => (c.id === target.id ? { ...c, unread_count: 0 } : c)));
    }

    return () => {
      cancelled = true;
    };
  }, [activeTarget, projectId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const activeTargetRef = useRef<ActiveTarget>(null);
  useEffect(() => {
    activeTargetRef.current = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    if (!user) return;
    const ws = connectNotificationSocket((event: any) => {
      if (event.event !== "message_created") return;
      const msg: DirectMessage = event.message;
      const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      if (otherId == null) return;

      const active = activeTargetRef.current;
      setConversations((prev) => {
        const exists = prev.some((c) => c.user.id === otherId);
        const bumped = exists
          ? prev.map((c) =>
              c.user.id === otherId
                ? {
                    ...c,
                    last_message: msg,
                    unread_count:
                      (active?.kind === "dm" && active.id === otherId) || msg.sender_id === user.id
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

      if (active?.kind === "dm" && active.id === otherId) {
        setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !projectId) return;
    const ws = connectProjectSocket(projectId, (event: any) => {
      if (event.event !== "channel_message_created") return;
      const msg: ChannelMessage = event.message;
      const channelId: number = event.channel_id;
      const active = activeTargetRef.current;
      const isActive = active?.kind === "channel" && active.id === channelId;

      if (isActive) {
        if (msg.sender_id === user.id) return; // already added optimistically on send
        setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } else if (msg.sender_id !== user.id) {
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unread_count: c.unread_count + 1 } : c))
        );
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
    setBody(replaced + afterCursor);
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (activeTarget === null || !body.trim()) return;
    setSending(true);
    try {
      if (activeTarget.kind === "channel") {
        const msg = await sendChannelMessage(projectId, activeTarget.id, body.trim());
        setThread((prev) => [...prev, msg]);
      } else {
        const msg = await sendMessage(projectId, activeTarget.id, body.trim());
        setThread((prev) => [...prev, msg]);
        setConversations((prev) =>
          prev
            .map((c) => (c.user.id === activeTarget.id ? { ...c, last_message: msg } : c))
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

  // Clears message history with this person, but keeps them in the DM list —
  // the list is built from project membership, not from message existence,
  // so "clearing" a chat should never make someone disappear from the sidebar.
  async function handleClearChat(otherUserId: number) {
    if (!confirm("Clear this chat? The message history will be permanently deleted.")) return;
    await clearConversation(projectId, otherUserId);
    setConversations((prev) =>
      prev.map((c) => (c.user.id === otherUserId ? { ...c, last_message: null, unread_count: 0 } : c))
    );
    if (activeTarget?.kind === "dm" && activeTarget.id === otherUserId) {
      setThread([]);
    }
  }

  function existingChannelByName(name: string): Channel | undefined {
    const normalized = name.trim().toLowerCase();
    return channels.find((c) => c.name.trim().toLowerCase() === normalized);
  }

  // Creating a channel: check locally for a name collision first (instant,
  // no round trip) and jump straight to the existing channel if found. Also
  // handle the case where the local list is stale and the server rejects it
  // as a duplicate anyway — fetch the full list and jump to it there too.
  async function submitNewChannel(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setChannelError(null);

    const localMatch = existingChannelByName(trimmed);
    if (localMatch) {
      setChannelNotice(`"${localMatch.name}" already exists — opening it.`);
      setActiveTarget({ kind: "channel", id: localMatch.id });
      setShowNewChannel(false);
      setNewChannelName("");
      return;
    }

    try {
      const channel = await createChannel(projectId, trimmed);
      setChannels((prev) => [...prev, channel]);
      setNewChannelName("");
      setShowNewChannel(false);
      setActiveTarget({ kind: "channel", id: channel.id });
    } catch (err: any) {
      if (err?.status === 400) {
        // Stale local list — re-fetch and try to find + redirect to the real match.
        const fresh = await listChannels(projectId);
        setChannels(fresh);
        const match = fresh.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
        if (match) {
          setChannelNotice(`"${match.name}" already exists — opening it.`);
          setActiveTarget({ kind: "channel", id: match.id });
          setShowNewChannel(false);
          setNewChannelName("");
          return;
        }
        setChannelError(`A channel named "${trimmed}" already exists.`);
      } else {
        setChannelError(err?.message ?? "Couldn't create channel.");
      }
    }
  }

  function handleCreateChannelSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitNewChannel(newChannelName);
  }

  async function handleRenameChannel(channelId: number) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingChannelId(null);
      return;
    }
    try {
      const updated = await renameChannel(projectId, channelId, name);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, name: updated.name } : c)));
    } catch (err: any) {
      setChannelError(err?.message ?? "Couldn't rename channel.");
    } finally {
      setRenamingChannelId(null);
    }
  }

  async function handleArchiveChannel(channelId: number) {
    if (!confirm("Archive this channel? It'll be hidden from the channel list.")) return;
    try {
      await archiveChannel(projectId, channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (activeTarget?.kind === "channel" && activeTarget.id === channelId) {
        const general = channels.find((c) => c.is_general);
        setActiveTarget(general ? { kind: "channel", id: general.id } : null);
      }
    } catch (err: any) {
      setChannelError(err?.message ?? "Couldn't archive channel.");
    }
  }

  // Starting a new DM: a person can only ever have one conversation thread
  // with you (the list is one-row-per-member), so "already exists" for a DM
  // just means opening that existing thread instead of creating a new one.
  function handleStartDm(otherUserId: number) {
    const existing = conversations.find((c) => c.user.id === otherUserId);
    if (existing?.last_message) {
      setChannelNotice(`You already have a conversation with ${existing.user.full_name} — opening it.`);
    }
    setActiveTarget({ kind: "dm", id: otherUserId });
    setShowNewDm(false);
  }

  if (loading || !user || fetching) return <PageLoader />;

  if (loadError || !project) {
    return (
      <div className="panel p-6 text-sm" style={{ color: "var(--paper-dim)" }}>
        Couldn't load chat{loadError ? `: ${loadError}` : "."} Try refreshing the page.
      </div>
    );
  }

  const sortedChannels = [...channels].sort((a, b) => {
    if (a.is_general !== b.is_general) return a.is_general ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const activeConvo =
    activeTarget?.kind === "dm" ? conversations.find((c) => c.user.id === activeTarget.id) : undefined;
  const activeChannelObj =
    activeTarget?.kind === "channel" ? channels.find((c) => c.id === activeTarget.id) : undefined;
  const activeTitle =
    activeTarget?.kind === "channel" ? `# ${activeChannelObj?.name ?? ""}` : activeConvo?.user.full_name;
  const mentionCandidates =
    mentionQuery !== null
      ? members
          .filter((m) => m.user.id !== user.id)
          .filter((m) => m.user.full_name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];

  const dmCandidates = members.filter((m) => m.user.id !== user.id);
  const unusedPresets = PRESET_CHANNEL_NAMES.filter((name) => !existingChannelByName(name));

  return (
    <div>
      {channelNotice && (
        <div className="panel mb-3 px-3 py-2 text-sm" style={{ color: "var(--amber)" }}>
          {channelNotice}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[240px_1fr]" style={{ height: 560 }}>
        {/* Channel list + private DMs */}
        <div className="panel flex flex-col overflow-y-auto">
          <div className="px-3 pt-3 pb-2">
            <input
              type="text"
              className="field w-full text-sm"
              placeholder="Search channels…"
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between px-3 pb-1">
            <p className="label-mono" style={{ color: "var(--paper-dim)" }}>
              Channels
            </p>
            <button
              type="button"
              onClick={() => {
                setShowNewChannel((s) => !s);
                setShowNewDm(false);
              }}
              className="label-mono"
              style={{ color: "var(--amber)" }}
              title="Create channel"
            >
              + New
            </button>
          </div>

          {showNewChannel && (
            <div className="px-3 pb-2">
              {unusedPresets.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {unusedPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => submitNewChannel(preset)}
                      className="rounded px-2 py-1 text-xs"
                      style={{ background: "var(--ink-2)", color: "var(--paper-dim)" }}
                    >
                      # {preset}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={handleCreateChannelSubmit} className="flex gap-1">
                <input
                  autoFocus
                  type="text"
                  className="field flex-1 text-sm"
                  placeholder="custom-channel-name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
                <button type="submit" className="btn-primary shrink-0 text-sm">
                  Add
                </button>
              </form>
            </div>
          )}
          {channelError && (
            <p className="px-3 pb-2 text-xs" style={{ color: "#e08585" }}>
              {channelError}
            </p>
          )}

          {sortedChannels.map((c) => (
            <div
              key={c.id}
              className="group flex items-center justify-between gap-2 px-3 py-3"
              style={{
                background: activeTarget?.kind === "channel" && activeTarget.id === c.id ? "var(--ink-2)" : "transparent",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              {renamingChannelId === c.id ? (
                <input
                  autoFocus
                  type="text"
                  className="field flex-1 text-sm"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameChannel(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameChannel(c.id);
                    if (e.key === "Escape") setRenamingChannelId(null);
                  }}
                />
              ) : (
                <button
                  onClick={() => setActiveTarget({ kind: "channel", id: c.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    <span style={{ color: "var(--paper-dim)" }}>#</span> {c.name}
                  </p>
                </button>
              )}

              {c.unread_count > 0 && renamingChannelId !== c.id && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
                  style={{ background: "var(--amber)", color: "#0b1521" }}
                >
                  {c.unread_count}
                </span>
              )}

              {!c.is_general && renamingChannelId !== c.id && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingChannelId(c.id);
                      setRenameValue(c.name);
                    }}
                    style={{ color: "var(--paper-dim)" }}
                    title="Rename channel"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchiveChannel(c.id)}
                    style={{ color: "var(--paper-dim)" }}
                    title="Archive channel"
                  >
                    🗄
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <p className="label-mono" style={{ color: "var(--paper-dim)" }}>
              Direct messages
            </p>
            <button
              type="button"
              onClick={() => {
                setShowNewDm((s) => !s);
                setShowNewChannel(false);
              }}
              className="label-mono"
              style={{ color: "var(--amber)" }}
              title="Start a new DM"
            >
              + New
            </button>
          </div>

          {showNewDm && (
            <div className="px-3 pb-2">
              {dmCandidates.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--paper-dim)" }}>
                  No other members on this project yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {dmCandidates.map((m) => (
                    <button
                      key={m.user.id}
                      type="button"
                      onClick={() => handleStartDm(m.user.id)}
                      className="rounded px-2 py-1.5 text-left text-sm"
                      style={{ background: "var(--ink-2)" }}
                    >
                      {m.user.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {conversations.length === 0 ? (
            <p className="p-3 text-sm" style={{ color: "var(--paper-dim)" }}>
              No other members on this project yet.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.user.id}
                onClick={() => setActiveTarget({ kind: "dm", id: c.user.id })}
                className="flex items-center justify-between gap-2 px-3 py-3 text-left"
                style={{
                  background: activeTarget?.kind === "dm" && activeTarget.id === c.user.id ? "var(--ink-2)" : "transparent",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                <div className="min-w-0 flex-1">
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
          {activeTarget === null || (activeTarget.kind === "dm" && !activeConvo) ? (
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
                {activeTarget.kind === "dm" && activeConvo && (
                  <button
                    type="button"
                    onClick={() => handleClearChat(activeConvo.user.id)}
                    className="label-mono"
                    style={{ color: "var(--paper-dim)" }}
                    title="Clear chat history"
                  >
                    Clear chat
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
                  <div key={activeTarget.kind + activeTarget.id} className="flex flex-col gap-2">
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
                            {activeTarget.kind === "channel" && !mine && (
                              <p className="label-mono mb-0.5" style={{ color: "var(--paper-dim)" }}>
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
