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
  unarchiveChannel,
  deleteChannel,
  listChannelMessages,
  sendChannelMessage,
  listMembers,
  clearConversation,
  searchMessages,
  getPresence,
  connectNotificationSocket,
  connectProjectSocket,
  uploadMessageAttachment,
  uploadChannelMessageAttachment,
  downloadAttachment,
  attachmentUrl,
  CHAT_ATTACHMENT_ACCEPT,
  type Project,
  type Conversation,
  type DirectMessage,
  type ProjectMember,
  type Channel,
  type ChannelMessage,
  type Attachment,
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

  // Archived channels panel
  const [showArchived, setShowArchived] = useState(false);
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // New DM picker
  const [showNewDm, setShowNewDm] = useState(false);

  // DM search — searches message bodies across all of the user's DM threads
  // in this project, distinct from the channel-name search box above.
  const [dmSearch, setDmSearch] = useState("");
  const [dmSearchResults, setDmSearchResults] = useState<DirectMessage[]>([]);
  const [dmSearchLoading, setDmSearchLoading] = useState(false);

  // Presence — user ids currently online, kept in sync via WS presence_changed
  // events after an initial REST snapshot on load.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Chat attachments (BS-103) — a file picked but not yet sent, and the
  // per-message upload/error state keyed by message id for the send flow.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  function loadChannels() {
    return listChannels(projectId).then(setChannels);
  }

  function loadArchivedChannels() {
    setArchivedLoading(true);
    return listChannels(projectId, { includeArchived: true })
      .then((all) => setArchivedChannels(all.filter((c) => c.is_archived)))
      .catch((err) => setChannelError(err?.message ?? "Couldn't load archived channels."))
      .finally(() => setArchivedLoading(false));
  }

  function toggleShowArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchivedChannels();
  }

  useEffect(() => {
    if (!user || !projectId) return;
    Promise.all([
      getProject(projectId),
      listConversations(projectId),
      listMembers(projectId),
      listChannels(projectId),
      getPresence(projectId),
    ])
      .then(([p, convos, memberList, channelList, presence]) => {
        setProject(p);
        setConversations(convos);
        setMembers(memberList);
        setChannels(channelList);
        setOnlineUserIds(new Set(presence.online_user_ids));

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
    if (!user || !projectId) return;
    if (!dmSearch.trim()) {
      setDmSearchResults([]);
      return;
    }
    setDmSearchLoading(true);
    const handle = setTimeout(() => {
      searchMessages(projectId, dmSearch.trim())
        .then(setDmSearchResults)
        .catch((err) => console.error("DM search failed:", err))
        .finally(() => setDmSearchLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [dmSearch, projectId, user]);

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
      if (event.event === "presence_changed") {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (event.online) next.add(event.user_id);
          else next.delete(event.user_id);
          return next;
        });
        return;
      }

      if (event.event === "messages_read") {
        // The other participant just read everything we'd sent them up to
        // read_at — reflect that in the open thread if we're looking at it,
        // so "Seen" appears live instead of only after a refresh.
        const readerId: number = event.reader_id;
        const readAt: string = event.read_at;
        const active = activeTargetRef.current;
        if (active?.kind === "dm" && active.id === readerId) {
          setThread((prev) =>
            prev.map((m) =>
              "recipient_id" in m && m.sender_id === user.id && new Date(m.created_at) <= new Date(readAt)
                ? { ...m, read_at: readAt }
                : m
            )
          );
        }
        return;
      }

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
    if (activeTarget === null) return;
    const trimmedBody = body.trim();
    const fileToSend = pendingFile;
    if (!trimmedBody && !fileToSend) return;
    setSending(true);
    setAttachError(null);
    try {
      let msg: ThreadMessage =
        activeTarget.kind === "channel"
          ? await sendChannelMessage(projectId, activeTarget.id, trimmedBody)
          : await sendMessage(projectId, activeTarget.id, trimmedBody);

      if (fileToSend) {
        try {
          const attachment =
            activeTarget.kind === "channel"
              ? await uploadChannelMessageAttachment(msg.id, fileToSend)
              : await uploadMessageAttachment(msg.id, fileToSend);
          msg = { ...msg, attachments: [...(msg.attachments ?? []), attachment] };
        } catch (err: any) {
          // Message already sent — surface the upload failure without losing the message.
          setAttachError(err?.message ?? "Failed to upload attachment.");
        }
      }

      setThread((prev) => [...prev, msg]);
      if (activeTarget.kind === "dm") {
        setConversations((prev) =>
          prev
            .map((c) => (c.user.id === activeTarget.id ? { ...c, last_message: msg as DirectMessage } : c))
            .sort((a, b) => {
              const at = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
              const bt = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
              return bt - at;
            })
        );
      }
      setBody("");
      setMentionQuery(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setAttachError(null);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setAttachError("File is too large (25MB max).");
      e.target.value = "";
      return;
    }
    setPendingFile(file);
  }

  function clearPendingFile() {
    setPendingFile(null);
    setAttachError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDownloadAttachment(attachment: Attachment) {
    try {
      await downloadAttachment(attachment);
    } catch (err: any) {
      setAttachError(err?.message ?? "Failed to download attachment.");
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
      // Keep the archived panel in sync if it's open.
      if (showArchived) loadArchivedChannels();
    } catch (err: any) {
      setChannelError(err?.message ?? "Couldn't archive channel.");
    }
  }

  async function handleUnarchiveChannel(channelId: number) {
    try {
      const channel = await unarchiveChannel(projectId, channelId);
      setArchivedChannels((prev) => prev.filter((c) => c.id !== channelId));
      setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
      setChannelNotice(`"${channel.name}" restored.`);
    } catch (err: any) {
      setChannelError(err?.message ?? "Couldn't unarchive channel.");
    }
  }

  // Permanent delete is only ever offered from the archived list — the
  // backend enforces this too (400s if the channel isn't archived), so this
  // is a genuine safeguard, not just a UI convenience.
  async function handleDeleteChannel(channelId: number, channelName: string) {
    if (
      !confirm(
        `Permanently delete "#${channelName}"? This deletes all its messages and can't be undone.`
      )
    )
      return;
    try {
      await deleteChannel(projectId, channelId);
      setArchivedChannels((prev) => prev.filter((c) => c.id !== channelId));
      setChannelNotice(`"${channelName}" permanently deleted.`);
    } catch (err: any) {
      setChannelError(err?.message ?? "Couldn't delete channel.");
    }
  }

  function openConversationFromHit(hit: DirectMessage) {
    if (!user) return;
    const otherId = hit.sender_id === user.id ? hit.recipient_id : hit.sender_id;
    if (otherId == null) return;
    setActiveTarget({ kind: "dm", id: otherId });
    setDmSearch("");
    setDmSearchResults([]);
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

  const sortedArchivedChannels = [...archivedChannels].sort((a, b) => a.name.localeCompare(b.name));

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
                    className="label-mono"
                    style={{ color: "var(--paper-dim)" }}
                    title="Rename channel"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchiveChannel(c.id)}
                    className="label-mono"
                    style={{ color: "var(--paper-dim)" }}
                    title="Archive channel"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Archived channels toggle + list */}
          <div className="px-3 pt-2 pb-1">
            <button
              type="button"
              onClick={toggleShowArchived}
              className="label-mono"
              style={{ color: "var(--paper-dim)" }}
            >
              {showArchived ? "▾ Hide archived channels" : "▸ Show archived channels"}
            </button>
          </div>

          {showArchived && (
            <div className="pb-2">
              {archivedLoading ? (
                <p className="px-3 py-1 text-xs" style={{ color: "var(--paper-dim)" }}>
                  Loading…
                </p>
              ) : sortedArchivedChannels.length === 0 ? (
                <p className="px-3 py-1 text-xs" style={{ color: "var(--paper-dim)" }}>
                  No archived channels.
                </p>
              ) : (
                sortedArchivedChannels.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    style={{ borderBottom: "1px solid var(--line-soft)" }}
                  >
                    <span className="truncate" style={{ color: "var(--paper-dim)" }}>
                      # {c.name}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUnarchiveChannel(c.id)}
                        className="label-mono"
                        style={{ color: "var(--amber)" }}
                        title="Unarchive channel"
                      >
                        Unarchive
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteChannel(c.id, c.name)}
                        className="label-mono"
                        style={{ color: "#e08585" }}
                        title="Permanently delete channel"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="px-3 pt-3 pb-1">
            <input
              type="text"
              className="field w-full text-sm"
              placeholder="Search messages…"
              value={dmSearch}
              onChange={(e) => setDmSearch(e.target.value)}
            />
          </div>

          {dmSearch.trim() && (
            <div className="px-3 pb-2">
              {dmSearchLoading ? (
                <p className="text-xs" style={{ color: "var(--paper-dim)" }}>
                  Searching…
                </p>
              ) : dmSearchResults.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--paper-dim)" }}>
                  No messages found.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {dmSearchResults.map((hit) => {
                    const otherId = hit.sender_id === user.id ? hit.recipient_id : hit.sender_id;
                    const other = members.find((m) => m.user.id === otherId)?.user;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => openConversationFromHit(hit)}
                        className="rounded px-2 py-1.5 text-left text-sm"
                        style={{ background: "var(--ink-2)" }}
                      >
                        <p className="truncate font-medium">{other?.full_name ?? "Unknown"}</p>
                        <p className="truncate label-mono" style={{ color: "var(--paper-dim)" }}>
                          {hit.body}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                            {m.body && <p>{m.body}</p>}
                            {m.attachments && m.attachments.length > 0 && (
                              <div className={`flex flex-col gap-1.5 ${m.body ? "mt-2" : ""}`}>
                                {m.attachments.map((a) =>
                                  a.is_image ? (
                                    <a
                                      key={a.id}
                                      href={attachmentUrl(a)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded"
                                    >
                                      <img
                                        src={attachmentUrl(a)}
                                        alt={a.original_filename ?? "attachment"}
                                        className="max-h-48 max-w-full rounded object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <button
                                      key={a.id}
                                      type="button"
                                      onClick={() => handleDownloadAttachment(a)}
                                      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                                      style={{
                                        background: mine ? "rgba(11,21,33,0.15)" : "var(--ink-3, #1a2531)",
                                      }}
                                      title="Download"
                                    >
                                      <span>📎</span>
                                      <span className="truncate">
                                        {a.original_filename ?? a.file_path.split("/").pop()}
                                      </span>
                                    </button>
                                  )
                                )}
                              </div>
                            )}
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

              <form onSubmit={handleSend} className="flex flex-col gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }}>
                {attachError && (
                  <p className="text-xs" style={{ color: "var(--red)" }}>
                    {attachError}
                  </p>
                )}
                {pendingFile && (
                  <div
                    className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs"
                    style={{ background: "var(--ink-2)" }}
                  >
                    <span className="truncate">📎 {pendingFile.name}</span>
                    <button
                      type="button"
                      onClick={clearPendingFile}
                      className="shrink-0 label-mono"
                      style={{ color: "var(--paper-dim)" }}
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="relative flex gap-2">
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={CHAT_ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-ghost shrink-0"
                    title="Attach a file"
                  >
                    📎
                  </button>
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
                  <button
                    type="submit"
                    disabled={sending || (!body.trim() && !pendingFile)}
                    className="btn-primary shrink-0"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
