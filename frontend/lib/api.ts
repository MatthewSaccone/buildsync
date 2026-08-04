// frontend/lib/api.ts

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: any;

  constructor(status: number, detail: any) {
    const message = typeof detail === "string" ? detail : "API Request Failed";
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// ==========================================
// Types
// ==========================================

export type UserRole =
  | "architect"
  | "builder"
  | "general_contractor"
  | "electrician"
  | "plumber"
  | "hvac"
  | "framer"
  | "owner"
  | "other"
  | string;

export type ProjectRole = "owner" | "admin" | "member" | "viewer" | string;

export type PinStatus = "open" | "in_progress" | "blocked" | "resolved" | "verified" | string;

export type PinPriority = | "low" | "normal" | "high" | "urgent" | string;

export interface User {
  id: number;
  email: string;
  full_name: string;
  company_name: string | null;
  role: UserRole;
  phone: string | null;
}

export interface Project {
  id: number;
  name: string;
  address: string | null;
  created_by_id: number;
  created_at: string;
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  project_id: number | null;
  pin_id: number | null;
  read: boolean;
  created_at: string;
}

export interface MaterialVariant {
  id: number;
  material_id: number;
  size: string;
  unit: string | null;
  price: number;
  sku: string | null;
  updated_at: string;
}

export interface Material {
  id: number;
  name: string;
  category: string | null;
  notes: string | null;
  created_by_id: number;
  created_at: string;
  variants: MaterialVariant[];
}

export interface MaterialCostLine {
  material_variant_id: number;
  material_name: string;
  material_category: string | null;
  size: string;
  unit: string | null;
  total_quantity: number;
  unit_price: number;
  total_cost: number;
}

export interface ProjectCostSummary {
  project_id: number;
  lines: MaterialCostLine[];
  total_cost: number;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  role: ProjectRole;
  user: User;
}

export interface Sheet {
  id: number;
  project_id: number;
  root_sheet_id: number;
  title: string;
  file_path: string;
  url: string;
  version: number;
  uploaded_by_id: number;
  uploaded_at: string;
}

// Kept as an alias since some pages import SheetVersion — a version IS a Sheet row.
export type SheetVersion = Sheet;

export interface PinMaterial {
  id: number;
  pin_id: number;
  material_variant_id: number;
  material_name: string;
  material_category: string | null;
  size: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface Pin {
  id: number;
  sheet_id: number;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  title: string;
  status: PinStatus;
  priority: "low" | "normal" | "high" | "urgent" | string;
  trade: UserRole | null;
  created_by_id: number;
  assigned_to_id: number | null;
  created_at: string;
  resolved_at: string | null;
  materials: PinMaterial[];
  attachments: Attachment[];
  total_cost: number;
}

export interface Comment {
  id: number;
  pin_id: number | null;
  task_id: number | null;
  author_id: number;
  body: string;
  created_at: string;
  author: User;
  attachments: Attachment[];
}

export interface SearchHit {
  type: string;
  pin: Pin;
  sheet_id: number;
  matched_on: "title" | "comment";
  snippet: string | null;
}

export type JobStatus = "scheduled" | "in_progress" | "done" | "blocked" | string;

export interface ScheduledJob {
  id: number;
  project_id: number;
  pin_id: number | null;
  task_id: number | null;
  title: string;
  trade: UserRole | null;
  status: JobStatus;
  assigned_to_id: number | null;
  depends_on_id: number | null;
  start_time: string;
  end_time: string;
  created_by_id: number;
  created_at: string;
  project_name: string | null;
  project_address: string | null;
  assignee_name: string | null;
  pin_title: string | null;
  task_title: string | null;
}

export interface SearchResults {
  query: string;
  results: SearchHit[];
}

export interface DashboardStats {
  total_sheets?: number;
  total_members?: number;
  open_pins?: number;
  resolved_pins?: number;
  recent_activity_count?: number;
  [key: string]: any;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Attachment {
  id: number;
  pin_id: number | null;
  task_id: number | null;
  comment_id: number | null;
  file_path: string;
  uploaded_by_id: number;
  uploaded_at: string;
}

export interface OverduePin {
  id: number;
  sheet_id: number;
  title: string;
  status: PinStatus;
  priority: string;
  trade: UserRole | null;
  days_open: number;
}

export interface ActivityItem {
  kind: string;
  message: string;
  pin_id: number;
  pin_title: string;
  sheet_id: number;
  actor_name: string;
  created_at: string;
}

export interface DashboardData {
  project_id: number;
  total_pins: number;
  by_status: Record<string, number>;
  by_trade: Record<string, number>;
  by_priority: Record<string, number>;
  overdue: OverduePin[];
  recent_activity: ActivityItem[];
}

// ==========================================
// Token & Fetch Helpers
// ==========================================

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("token", token);
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function setRefreshToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("refresh_token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
  }
}

function storeTokenPair(data: TokenPair) {
  setToken(data.access_token);
  setRefreshToken(data.refresh_token);
}

// Refresh calls can race (e.g. two requests 401 at once) — share one in-flight
// promise so we don't burn through refresh-token rotation with parallel calls.
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError(401, "No refresh token available");

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearToken();
      throw new ApiError(res.status, "Session expired — please log in again");
    }

    const data: TokenPair = await res.json();
    storeTokenPair(data);
    return data.access_token;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}, _retried = false): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && !_retried && getRefreshToken()) {
    // Access token expired mid-session — refresh once, silently, and retry
    // the original request. If the refresh itself fails, fall through to
    // the normal error path below (which clears auth state).
    try {
      await refreshAccessToken();
      return fetchWithAuth(url, options, true);
    } catch {
      // fall through to error handling below
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) clearToken();
    throw new ApiError(res.status, data.detail || "Request failed");
  }
  return res;
}

// ==========================================
// Auth API
// ==========================================

export async function login(credentials: { email: string; password: string } | FormData) {
  let body: FormData;

  if (credentials instanceof FormData) {
    body = credentials;
    if (!body.has("username") && body.has("email")) {
      body.append("username", body.get("email") as string);
    }
  } else {
    body = new FormData();
    body.append("username", credentials.email);
    body.append("password", credentials.password);
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    body: body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data.detail || "Login failed");
  }

  if (data.access_token) {
    storeTokenPair(data);
  }

  return data;
}

export async function apiLogout(): Promise<void> {
  const refreshToken = getRefreshToken();
  clearToken();
  if (refreshToken) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // best-effort — local state is already cleared regardless of whether this succeeds
    }
  }
}

export async function signup(userData: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  company_name?: string;
  phone?: string;
}) {
  const fullName = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const payload = {
    ...userData,
    full_name: fullName || undefined,
  };

  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data.detail || "Signup failed");
  }

  return data;
}

export async function getMe(): Promise<User> {
  const res = await fetchWithAuth(`${API_URL}/auth/me`);
  return res.json();
}

export async function requestPasswordReset(email: string) {
  const res = await fetch(`${API_URL}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.detail || "Reset request failed");
  }
  return res.json();
}

export async function confirmPasswordReset(token: string, new_password: string) {
  const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.detail || "Password reset failed");
  }
  return res.json();
}

// ==========================================
// Projects & Dashboard API
// ==========================================

export async function listProjects(): Promise<Project[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/`);
  return res.json();
}

export async function createProject(projectData: Partial<Project>): Promise<Project> {
  const res = await fetchWithAuth(`${API_URL}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectData),
  });
  return res.json();
}

export async function getProject(id: string | number): Promise<Project> {
  const res = await fetchWithAuth(`${API_URL}/projects/${id}`);
  return res.json();
}

export async function getDashboard(projectId: string | number): Promise<DashboardData> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/dashboard`);
  return res.json();
}

export interface DirectMessage {
  id: number;
  project_id: number;
  sender_id: number;
  recipient_id: number | null;
  body: string;
  created_at: string;
  read_at: string | null;
  sender: User;
}

export interface Conversation {
  user: User;
  last_message: DirectMessage | null;
  unread_count: number;
}

export async function listConversations(projectId: string | number): Promise<Conversation[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/conversations`);
  return res.json();
}

export async function getMessageThread(
  projectId: string | number,
  otherUserId: string | number
): Promise<DirectMessage[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/messages/${otherUserId}`);
  return res.json();
}

export async function sendMessage(
  projectId: string | number,
  otherUserId: string | number,
  body: string
): Promise<DirectMessage> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/messages/${otherUserId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return res.json();
}

/** Substring search across every DM thread the current user is part of,
 * within this project. Returns raw DirectMessage hits (newest first) — the
 * caller maps each hit's sender/recipient back to a conversation to know
 * which thread to jump to. */
export async function searchMessages(
  projectId: string | number,
  query: string
): Promise<DirectMessage[]> {
  const res = await fetchWithAuth(
    `${API_URL}/projects/${projectId}/messages/search?q=${encodeURIComponent(query)}`
  );
  return res.json();
}

export interface PresenceSnapshot {
  online_user_ids: number[];
}

/** Initial online/offline snapshot for this project's members. Live
 * updates after this arrive via presence_changed events on the
 * notification WebSocket. */
export async function getPresence(projectId: string | number): Promise<PresenceSnapshot> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/presence`);
  return res.json();
}

// ==========================================
// Channels
// ==========================================

export interface Channel {
  id: number;
  project_id: number;
  name: string;
  is_general: boolean;
  is_archived: boolean;
  created_by_id: number;
  created_at: string;
  archived_at: string | null;
  unread_count: number;
  last_message_at: string | null;
}

export interface ChannelMessage {
  id: number;
  channel_id: number;
  sender_id: number;
  body: string;
  task_id: number | null;
  created_at: string;
  sender: User;
}

export async function listChannels(
  projectId: string | number,
  opts?: { q?: string; includeArchived?: boolean }
): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.includeArchived) params.set("include_archived", "true");
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createChannel(projectId: string | number, name: string): Promise<Channel> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function renameChannel(
  projectId: string | number,
  channelId: string | number,
  name: string
): Promise<Channel> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function archiveChannel(
  projectId: string | number,
  channelId: string | number
): Promise<Channel> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}/archive`, {
    method: "POST",
  });
  return res.json();
}

export async function unarchiveChannel(
  projectId: string | number,
  channelId: string | number
): Promise<Channel> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}/unarchive`, {
    method: "POST",
  });
  return res.json();
}

export async function deleteChannel(
  projectId: string | number,
  channelId: string | number
): Promise<void> {
  await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}`, {
    method: "DELETE",
  });
}

export async function listChannelMessages(
  projectId: string | number,
  channelId: string | number
): Promise<ChannelMessage[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}/messages`);
  return res.json();
}

export async function searchChannels(
  projectId: string | number,
  query: string
): Promise<Channel[]> {
  return listChannels(projectId, { q: query });
}

export async function sendChannelMessage(
  projectId: string | number,
  channelId: string | number,
  body: string
): Promise<ChannelMessage> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return res.json();
}

export async function deleteConversation(
  projectId: string | number,
  otherUserId: string | number
): Promise<void> {
  await fetchWithAuth(`${API_URL}/projects/${projectId}/messages/${otherUserId}`, {
    method: "DELETE",
  });
}

// Clears message history with a DM partner but — unlike deleteConversation —
// is named for what the UI calls it ("Clear chat"). Same endpoint: the
// conversation itself is derived from project membership, not from message
// existence, so wiping the thread never removes the person from the list.
export async function clearConversation(
  projectId: string | number,
  otherUserId: string | number
): Promise<void> {
  return deleteConversation(projectId, otherUserId);
}

export async function listMembers(projectId: string | number): Promise<ProjectMember[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/members`);
  return res.json();
}

export async function addMember(
  projectId: string | number,
  data: { user_id: string | number; role?: string }
): Promise<ProjectMember> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMemberRole(
  projectId: string | number,
  memberId: string | number,
  role: string
): Promise<ProjectMember> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

export async function removeMember(
  projectId: string | number,
  memberId: string | number
): Promise<void> {
  await fetchWithAuth(`${API_URL}/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export async function lookupUser(email: string): Promise<User> {
  const res = await fetchWithAuth(`${API_URL}/auth/lookup?email=${encodeURIComponent(email)}`);
  return res.json();
}

// ==========================================
// Costs & Materials Export API
// ==========================================

export async function getProjectCostSummary(
  projectId: string | number,
  status?: PinStatus
): Promise<ProjectCostSummary> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/materials-cost${qs ? `?${qs}` : ""}`);
  return res.json();
}

/** Builds the export URL only — the caller is responsible for attaching the
 * Authorization header (the backend requires it; a bare <a href> won't work). */
export function materialsCsvExportUrl(projectId: string | number, status?: PinStatus): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return `${API_URL}/projects/${projectId}/materials-cost/export${qs ? `?${qs}` : ""}`;
}

// ==========================================
// Pins API
// ==========================================

export async function listProjectPins(
  projectId: string | number,
  filters?: { status?: PinStatus; trade?: UserRole }
): Promise<Pin[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.trade) params.set("trade", filters.trade);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/pins${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function listPins(
  sheetId: string | number,
  filters?: { status?: PinStatus; trade?: UserRole }
): Promise<Pin[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.trade) params.set("trade", filters.trade);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/sheets/${sheetId}/pins${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createPin(
  sheetId: string | number,
  pinData: {
    x: number;
    y: number;
    title: string;
    trade?: UserRole | null;
    priority?: string;
    assigned_to_id?: number | null;
  }
): Promise<Pin> {
  const res = await fetchWithAuth(`${API_URL}/sheets/${sheetId}/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet_id: Number(sheetId), ...pinData }),
  });
  return res.json();
}

export async function updatePin(
  sheetId: string | number,
  pinId: string | number,
  pinData: Partial<{
    status: PinStatus;
    priority: string;
    assigned_to_id: number | null;
    title: string;
    trade: UserRole | null;
  }>
): Promise<Pin> {
  const res = await fetchWithAuth(`${API_URL}/sheets/${sheetId}/pins/${pinId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pinData),
  });
  return res.json();
}

export async function deletePin(sheetId: string | number, pinId: string | number): Promise<void> {
  await fetchWithAuth(`${API_URL}/sheets/${sheetId}/pins/${pinId}`, {
    method: "DELETE",
  });
}

// ==========================================
// Comments API
// ==========================================

export async function listComments(pinId: string | number): Promise<Comment[]> {
  const res = await fetchWithAuth(`${API_URL}/pins/${pinId}/comments`);
  return res.json();
}

export async function addComment(pinId: string | number, body: string): Promise<Comment> {
  const res = await fetchWithAuth(`${API_URL}/pins/${pinId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return res.json();
}

// ==========================================
// Sheets & Search API
// ==========================================

export async function listSheets(projectId: string | number): Promise<Sheet[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/sheets`);
  return res.json();
}

export async function uploadSheet(projectId: string | number, title: string, file: File): Promise<Sheet> {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("file", file);
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/sheets`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function listSheetVersions(projectId: string | number, sheetId: string | number): Promise<Sheet[]> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/sheets/${sheetId}/versions`);
  return res.json();
}

export async function uploadSheetVersion(
  projectId: string | number,
  sheetId: string | number,
  file: File
): Promise<Sheet> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/sheets/${sheetId}/versions`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

/** SheetOut already includes a computed `url` (e.g. "/static/uploads/xyz.png"); fall back to
 * deriving one from file_path for any caller still holding an older cached object. */
export function sheetImageUrl(sheet: Sheet | string | number): string {
  if (typeof sheet === "object" && sheet.url) {
    return `${API_URL}${sheet.url}`;
  }
  if (typeof sheet === "object") {
    const filename = sheet.file_path.split("/").pop();
    return `${API_URL}/static/uploads/${filename}`;
  }
  // Bare id with no Sheet object available — nothing we can construct reliably.
  return "";
}

export async function searchProject(
  projectId: string | number,
  query: string
): Promise<SearchResults> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

// ==========================================
// Materials API
// ==========================================

export async function listMaterials(filters?: { q?: string; category?: string }): Promise<Material[]> {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.category) params.set("category", filters.category);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/materials${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createMaterial(data: {
  name: string;
  category?: string;
  notes?: string;
  variants?: { size: string; unit?: string; price: number; sku?: string }[];
}): Promise<Material> {
  const res = await fetchWithAuth(`${API_URL}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMaterial(
  materialId: number,
  data: Partial<{ name: string; category: string; notes: string }>
): Promise<Material> {
  const res = await fetchWithAuth(`${API_URL}/materials/${materialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMaterial(id: number): Promise<void> {
  await fetchWithAuth(`${API_URL}/materials/${id}`, {
    method: "DELETE",
  });
}

/** All three variant endpoints return the parent Material (with its full variants
 * array), not the single variant — that's what the backend actually sends back. */
export async function addMaterialVariant(
  materialId: number,
  data: { size: string; unit?: string; price: number; sku?: string }
): Promise<Material> {
  const res = await fetchWithAuth(`${API_URL}/materials/${materialId}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMaterialVariant(
  materialId: number,
  variantId: number,
  data: Partial<{ size: string; unit: string; price: number; sku: string }>
): Promise<Material> {
  const res = await fetchWithAuth(`${API_URL}/materials/${materialId}/variants/${variantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMaterialVariant(materialId: number, variantId: number): Promise<Material> {
  const res = await fetchWithAuth(`${API_URL}/materials/${materialId}/variants/${variantId}`, {
    method: "DELETE",
  });
  return res.json();
}

// ==========================================
// Notifications & WebSockets API
// ==========================================

export async function listNotifications(): Promise<Notification[]> {
  const res = await fetchWithAuth(`${API_URL}/notifications`);
  return res.json();
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetchWithAuth(`${API_URL}/notifications/${id}/read`, {
    method: "POST",
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchWithAuth(`${API_URL}/notifications/read-all`, {
    method: "POST",
  });
}

// ==========================================
// Attachments API
// ==========================================

/** Matches the (file, pinId?, commentId?) signature AttachmentUploader already calls;
 * taskId is a new optional third target. */
export async function uploadAttachment(
  file: File,
  pinId?: number | string,
  commentId?: number | string,
  taskId?: number | string
): Promise<Attachment> {
  if (!pinId && !commentId && !taskId) {
    throw new ApiError(400, "uploadAttachment needs a pinId, taskId, or commentId");
  }
  const formData = new FormData();
  formData.append("file", file);

  const url = pinId
    ? `${API_URL}/pins/${pinId}/attachments`
    : taskId
    ? `${API_URL}/tasks/${taskId}/attachments`
    : `${API_URL}/comments/${commentId}/attachments`;

  const res = await fetchWithAuth(url, { method: "POST", body: formData });
  return res.json();
}

export async function listTaskAttachments(taskId: number | string): Promise<Attachment[]> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/attachments`);
  return res.json();
}

export async function listPinAttachments(pinId: number | string): Promise<Attachment[]> {
  const res = await fetchWithAuth(`${API_URL}/pins/${pinId}/attachments`);
  return res.json();
}

export async function listCommentAttachments(commentId: number | string): Promise<Attachment[]> {
  const res = await fetchWithAuth(`${API_URL}/comments/${commentId}/attachments`);
  return res.json();
}

export async function deleteAttachment(attachmentId: number | string): Promise<void> {
  await fetchWithAuth(`${API_URL}/attachments/${attachmentId}`, { method: "DELETE" });
}

/** The backend stores file_path as a disk path (e.g. "app/static/uploads/xyz.jpg");
 * it's served back out under /static/uploads/<filename>. */
export function attachmentUrl(attachment: Attachment | string): string {
  const filePath = typeof attachment === "string" ? attachment : attachment.file_path;
  const filename = filePath.split("/").pop();
  return `${API_URL}/static/uploads/${filename}`;
}

export function connectProjectSocket(
  projectId: string | number,
  onMessage: (event: any) => void
): WebSocket | null {
  const token = getToken();
  if (!token) return null;

  const wsUrl = API_URL.replace(/^http/, "ws") + `/ws/projects/${projectId}?token=${token}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch (e) {
      console.error("Failed to parse websocket message", e);
    }
  };

  return ws;
}

export function connectNotificationSocket(
  onNotification: (notif: any) => void
): WebSocket | null {
  const token = getToken();
  if (!token) return null;

  const wsUrl = API_URL.replace(/^http/, "ws") + `/ws/notifications?token=${token}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onNotification(data);
    } catch (e) {
      console.error("Failed to parse websocket message", e);
    }
  };

  return ws;
}

// ==========================================
// Pin Materials API
// ==========================================

export async function addPinMaterial(
  pinId: number | string,
  data: {
    material_variant_id: number;
    quantity: number;
  }
): Promise<PinMaterial> {
  const res = await fetchWithAuth(`${API_URL}/pins/${pinId}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return res.json();
}

export async function updatePinMaterial(
  pinId: number | string,
  pinMaterialId: number | string,
  quantity: number
): Promise<PinMaterial> {
  const res = await fetchWithAuth(
    `${API_URL}/pins/${pinId}/materials/${pinMaterialId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    }
  );

  return res.json();
}

export async function removePinMaterial(
  pinId: number | string,
  pinMaterialId: number | string
): Promise<void> {
  await fetchWithAuth(
    `${API_URL}/pins/${pinId}/materials/${pinMaterialId}`,
    {
      method: "DELETE",
    }
  );
}

// ==========================================
// Schedule API
// ==========================================

export interface ScheduledJobInput {
  title: string;
  trade?: UserRole | null;
  pin_id?: number | null;
  task_id?: number | null;
  assigned_to_id?: number | null;
  depends_on_id?: number | null;
  start_time: string;
  end_time: string;
}

export interface ScheduledJobUpdateInput {
  title?: string;
  trade?: UserRole | null;
  status?: JobStatus;
  pin_id?: number | null;
  task_id?: number | null;
  assigned_to_id?: number | null;
  depends_on_id?: number | null;
  start_time?: string;
  end_time?: string;
}

/** Every scheduled job across every project the current user belongs to —
 * this is what powers the top-level /schedule page. */
export async function listMySchedule(filters?: {
  start?: string;
  end?: string;
  project_id?: number;
  trade?: UserRole;
}): Promise<ScheduledJob[]> {
  const params = new URLSearchParams();
  if (filters?.start) params.set("start", filters.start);
  if (filters?.end) params.set("end", filters.end);
  if (filters?.project_id) params.set("project_id", String(filters.project_id));
  if (filters?.trade) params.set("trade", filters.trade);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/schedule${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function listProjectSchedule(
  projectId: number | string,
  filters?: { start?: string; end?: string }
): Promise<ScheduledJob[]> {
  const params = new URLSearchParams();
  if (filters?.start) params.set("start", filters.start);
  if (filters?.end) params.set("end", filters.end);
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/schedule${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createScheduledJob(
  projectId: number | string,
  data: ScheduledJobInput
): Promise<ScheduledJob> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateScheduledJob(
  projectId: number | string,
  jobId: number | string,
  data: ScheduledJobUpdateInput
): Promise<ScheduledJob> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/schedule/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteScheduledJob(projectId: number | string, jobId: number | string): Promise<void> {
  await fetchWithAuth(`${API_URL}/projects/${projectId}/schedule/${jobId}`, {
    method: "DELETE",
  });
}

// ==========================================
// Tasks API
// ==========================================

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | string;

export interface TaskPinRef {
  id: number;
  title: string;
  sheet_id: number;
  status: PinStatus;
}

export interface TaskMaterial {
  id: number;
  task_id: number;
  material_variant_id: number;
  material_name: string;
  material_category: string | null;
  size: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: PinPriority;
  owner_id: number | null;
  owner: User | null;
  due_date: string | null;
  created_by_id: number;
  created_at: string;
  completed_at: string | null;
  comments: Comment[];
  attachments: Attachment[];
  related_pins: TaskPinRef[];
  materials: TaskMaterial[];
  total_cost: number;  
}

export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: PinPriority;
  owner_id?: number | null;
  due_date?: string | null;
  related_pin_ids?: number[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: PinPriority;
  owner_id?: number | null;
  due_date?: string | null;
  related_pin_ids?: number[];
}

export async function listTasks(
  projectId: number | string,
  filters?: { status?: TaskStatus; owner_id?: number }
): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.owner_id) params.set("owner_id", String(filters.owner_id));
  const qs = params.toString();
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function getTask(projectId: number | string, taskId: number | string): Promise<Task> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/tasks/${taskId}`);
  return res.json();
}

export async function createTask(projectId: number | string, data: TaskInput): Promise<Task> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateTask(
  projectId: number | string,
  taskId: number | string,
  data: TaskUpdateInput
): Promise<Task> {
  const res = await fetchWithAuth(`${API_URL}/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteTask(projectId: number | string, taskId: number | string): Promise<void> {
  await fetchWithAuth(`${API_URL}/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
}

export async function listTaskComments(taskId: number | string): Promise<Comment[]> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/comments`);
  return res.json();
}

export async function addTaskComment(taskId: number | string, body: string): Promise<Comment> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return res.json();
}

// ==========================================
// Task Materials API
// ==========================================

export async function listTaskMaterials(taskId: number | string): Promise<TaskMaterial[]> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/materials`);
  return res.json();
}

export async function addTaskMaterial(
  taskId: number | string,
  data: { material_variant_id: number; quantity: number }
): Promise<TaskMaterial> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateTaskMaterial(
  taskId: number | string,
  taskMaterialId: number | string,
  quantity: number
): Promise<TaskMaterial> {
  const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/materials/${taskMaterialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}

export async function removeTaskMaterial(
  taskId: number | string,
  taskMaterialId: number | string
): Promise<void> {
  await fetchWithAuth(`${API_URL}/tasks/${taskId}/materials/${taskMaterialId}`, { method: "DELETE" });
}
