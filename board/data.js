/* Shared constants, state, DOM helpers and every database write the board makes. */
const LAUNCH = new Date(2026, 10, 19);
const PROJECT = "Project: a solo creator is making short-form GTA 6 content for TikTok, YouTube Shorts and Instagram Reels. GTA 6 launches on PS5 and Xbox Series X|S on Thursday 19 November 2026; PC comes later.";
const COLUMNS = [
  { id: "backlog", name: "Backlog", hint: "New tickets. Autopilot picks these up", color: "var(--muted)" },
  { id: "review", name: "On hold", hint: "Parked by you. Autopilot skips these", color: "var(--production)" },
  { id: "ready", name: "Queued", hint: "Autopilot works these next, top first", color: "var(--publishing)" },
  { id: "doing", name: "Agent working", hint: "Claude is doing the work", color: "var(--accent)" },
  { id: "check", name: "Check result", hint: "Results and questions for you", color: "var(--research)" },
  { id: "done", name: "Done", hint: "Approved by you", color: "var(--ok)" },
];
const AGENTS = {
  research: { name: "Research agent", color: "var(--research)", role: "You are the research agent. You produce clear, decision-ready research notes for a beginner creator. Never invent links, numbers, follower counts or quotes. When a fact can't be confirmed, write it on its own line starting with [verify] and say exactly where to check it." },
  script: { name: "Script agent", color: "var(--script)", role: "You are the script agent. You write short-form video scripts that hook in the first 2 seconds, are easy to read aloud, and list on-screen text and the footage needed for every beat." },
  production: { name: "Production agent", color: "var(--production)", role: "You are the production agent. You turn plans into practical step-by-step guides, shot lists and templates that one person on a low budget can follow." },
  publishing: { name: "Publishing agent", color: "var(--publishing)", role: "You are the publishing agent. You plan calendars, captions, profiles and posting schedules for TikTok, YouTube Shorts and Instagram Reels." },
  build: { name: "Coding agent", color: "var(--build)", role: "You are the coding agent. You design small, simple tools and give complete code files in fenced code blocks with file names, plus short setup steps. You can't run code or commit here, so list what should be tested." },
};
const PHASES = ["Setup", "Pre-launch", "Launch week", "Post-launch"];
const PRIORITIES = ["P1", "P2", "P3"];
const PRIO_RANK = { P1: 1, P2: 2, P3: 3 };
const EDITABLE = ["title", "purpose", "goal", "steps", "context", "deliverable", "acceptance", "outOfScope", "human", "priority", "due", "agent", "phase"];
const FIELD_NAMES = { title: "Title", purpose: "Why it matters", steps: "Steps", goal: "Goal", context: "Context", deliverable: "Deliverable", acceptance: "Acceptance criteria", outOfScope: "Out of scope", human: "Needs you", priority: "Priority", due: "Due date", agent: "Agent", phase: "Phase", column: "Column", output: "Result", dependsOn: "Depends on" };
const DEFAULT_SETTINGS = { dailyRunCap: 10, autoReview: true, runWhere: "browser", autopilot: true, perRun: 3 };
const ARTIFACT_URL = "https://claude.ai/artifact/PrT4ANqepTNYh5qMtN6WLA";
const REPO_URL = "https://github.com/leoloneumeister-collab/Kanban-Board-with-agents";
const CLOUD = "Claude Code Remote";
const MEMORY_FIELDS = [
  ["angle", "Channel angle", "The one angle every video serves, for example beginner guides for returning players"],
  ["audience", "Audience", "Who watches and what they want"],
  ["tone", "Tone and style", "How videos sound and look"],
  ["handles", "Handles and platforms", "Account names and where you post"],
  ["rules", "Content rules", "What you never do: leaks, licensed music, clickbait"],
];
const TAB_ID = "tab-" + Math.random().toString(36).slice(2, 10);
const FATAL = new Set(["not_granted", "rate_limited", "sampling_disabled", "session_expired"]);

const S = {
  db: null, sample: null, downloads: null, toolsOk: false, canWrite: true, loaded: false,
  tickets: new Map(), plan: null, settings: { ...DEFAULT_SETTINGS }, usage: { runs: 0 }, memory: null, memoryProposal: null, memoryEditing: false,
  filter: "all", sortMode: "manual",
  openId: null, tab: "brief", editing: false,
  messages: [], proposals: [], history: [], subs: [], subFor: null,
  chatCtl: null, chatPending: null, chatBusy: false,
  activeRuns: new Map(), runAllActive: false, stopAll: false, confirmRun: null,
  autopilot: null, mcp: null, cloudStatus: new Map(), selecting: false, selected: new Set(), view: "board", bufferDraft: null,
};

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
};
function mdNode(text, cls = "md") {
  const d = el("div", { class: cls });
  if (window.marked && window.DOMPurify) {
    d.innerHTML = DOMPurify.sanitize(marked.parse(String(text || "")));
    d.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  } else { d.textContent = text || ""; d.style.whiteSpace = "pre-wrap"; }
  return d;
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayISO() { return isoDay(new Date()); }
function parseDate(s) { if (!s) return null; const [y, m, d] = String(s).split("-").map(Number); return y ? new Date(y, m - 1, d) : null; }
function fmtDate(s) { const d = parseDate(s); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "No date"; }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; }
function ago(iso) {
  if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtTime(iso);
}
function daysUntil(d) { return Math.round((d - startOfToday()) / 86400000); }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 2600); }
function notice(msg) { const n = $("notice"); n.textContent = msg || ""; n.hidden = !msg; }
function colName(id) { return (COLUMNS.find((c) => c.id === id) || {}).name || id; }
function sampleError(e) {
  const c = e && e.code;
  if (c === "not_granted") return "Claude access was declined for this board. Reload the page to be asked again.";
  if (c === "rate_limited") return "You've reached your Claude usage limit or sent too many requests at once. Wait a while, then try again.";
  if (c === "sampling_disabled") return "Claude isn't available on this account.";
  if (c === "session_expired") return "Your claude.ai session ended. Sign in again, then retry.";
  if (c === "refused") return "Claude declined this request. Rephrase it and try again.";
  if (c === "prompt_too_large") return "This ticket has too much text for one request. Shorten the chat or the result, then retry.";
  if (c === "empty_completion") return "Claude returned nothing. Ask in a different way.";
  if (c === "invalid_json") return "Claude's answer couldn't be read. Try again.";
  if (c === "tools_unavailable") return "This app can't let Claude propose ticket changes. Chat still works.";
  if (c === "cap_reached") return "You've used today's agent run limit. Raise it in Settings or wait until tomorrow.";
  if (c === "locked") return "This ticket is already running in another tab.";
  return "The connection to Claude dropped. Try again.";
}

/* ---------- reads ---------- */
function ticketsIn(col) { return [...S.tickets.values()].filter((t) => t.column === col); }
function sortedIn(col) { return ticketsIn(col).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function orderFor(colId, movingId, beforeId) {
  const list = sortedIn(colId).filter((t) => t.id !== movingId);
  if (beforeId) {
    const i = list.findIndex((t) => t.id === beforeId);
    if (i >= 0) { const next = list[i].order ?? 0; const prev = i > 0 ? (list[i - 1].order ?? 0) : next - 2; return (prev + next) / 2; }
  }
  return list.length ? (list[list.length - 1].order ?? 0) + 1 : 1;
}
function ticketData(t) { const { id, ...rest } = t; return rest; }
function byKey(key) { return [...S.tickets.values()].find((t) => (t.key || t.id) === key) || S.tickets.get(key) || null; }
function deps(t) { return (t.dependsOn || []).map((k) => byKey(k)).filter(Boolean); }
function blockedBy(t) { return deps(t).filter((d) => d.column !== "done"); }
function memoryText() {
  const m = S.memory || {};
  const lines = MEMORY_FIELDS.filter(([k]) => m[k]).map(([k, label]) => `${label}: ${m[k]}`);
  return lines.length ? lines.join("\n") : "Not set yet. Don't assume an angle or audience the creator hasn't chosen.";
}

/* ---------- writes ---------- */
const ticketRef = (id) => S.db.collection("tickets").doc(id);
function handleWriteError(e) {
  if (e && e.code === "invalid_argument") { S.canWrite = false; notice("This board is read-only for you. Only the owner can change tickets."); window.renderAll && renderAll(); }
  else if (e && e.code === "quota_exceeded") notice("The board is full. Delete some finished tickets, then try again.");
  else toast("That change didn't save. Check your connection and try again.");
}
async function write(id, data, doneMsg) {
  if (!S.db) return false;
  try { await ticketRef(id).update(data); if (doneMsg) toast(doneMsg); return true; }
  catch (e) { handleWriteError(e); return false; }
}
async function moveTicket(id, colId, beforeId) {
  const t = S.tickets.get(id); if (!t || !COLUMNS.some((c) => c.id === colId)) return false;
  const order = orderFor(colId, id, beforeId);
  if (t.column === colId && t.order === order) return true;
  const ok = await write(id, { column: colId, order }, t.column === colId ? null : `Moved to ${colName(colId)}`);
  if (ok && colId === "done" && t.column !== "done" && t.recurrence === "weekly") proposeRecurrence(t);
  return ok;
}
function addDays(iso, n) { const d = parseDate(iso) || startOfToday(); d.setDate(d.getDate() + n); return isoDay(d); }
async function proposeRecurrence(t) {
  const next = { title: t.title, agent: t.agent, priority: t.priority, phase: t.phase, goal: t.goal, purpose: t.purpose || "", steps: (t.steps || []).map((x) => ({ ...x, done: false })), context: t.context, deliverable: t.deliverable,
    acceptance: t.acceptance || [], outOfScope: t.outOfScope || "", human: t.human || "", recurrence: "weekly", due: addDays(t.due, 7), repeatOf: t.key || t.id };
  try { await propose(t.id, "recur", { ticket: next }, `This ticket repeats weekly. Next one due ${fmtDate(next.due)}.`); toast("Next week's copy is waiting for your approval on the ticket."); } catch {}
}
function nextKey(offset = 0) {
  let max = 0;
  for (const t of S.tickets.values()) { const m = /^GTA-(\d+)$/.exec(t.key || t.id); if (m) max = Math.max(max, Number(m[1])); }
  return "GTA-" + String(max + 1 + offset).padStart(2, "0");
}
async function addEvent(id, text) {
  try { await S.db.collection(`tickets/${id}/messages`).add({ role: "event", text, at: new Date().toISOString() }); } catch {}
}

/* History: a full snapshot of the ticket before every content change, so anything can be restored. */
async function snapshot(id, reason) {
  const t = S.tickets.get(id); if (!t) return;
  try { await S.db.collection(`tickets/${id}/history`).add({ at: new Date().toISOString(), reason, ticket: ticketData(t) }); } catch {}
}
async function applyChange(id, data, reason, doneMsg) {
  await snapshot(id, reason);
  return write(id, data, doneMsg);
}
async function restoreSnapshot(id, h) {
  const keep = ["key", "order", "column", "pendingProposals", "chatCount"];
  const cur = S.tickets.get(id); if (!cur || !h || !h.ticket) return;
  await snapshot(id, "Before restoring an older version");
  const data = { ...h.ticket };
  for (const k of keep) if (k in cur) data[k] = cur[k];
  try { await ticketRef(id).set(data); toast("Older version restored"); addEvent(id, `You restored the version from ${fmtTime(h.at)}.`); }
  catch (e) { handleWriteError(e); }
}

/* Proposals: Claude never changes a ticket directly. It files a proposal that the creator accepts or rejects. */
async function propose(id, kind, data, why) {
  const t = S.tickets.get(id); if (!t) throw new Error("Ticket not found");
  const old = {};
  if (kind === "edit") for (const k of Object.keys(data)) old[k] = t[k] ?? (k === "acceptance" || k === "dependsOn" ? [] : "");
  if (kind === "move") old.column = t.column;
  if (kind === "result") old.output = t.output || "";
  await S.db.collection(`tickets/${id}/proposals`).add({ kind, data, old, why: why || "", status: "pending", at: new Date().toISOString() });
  await ticketRef(id).update({ pendingProposals: (t.pendingProposals || 0) + 1 });
}
async function resolveProposal(id, p, status) {
  const t = S.tickets.get(id); if (!t) return;
  try {
    await S.db.collection(`tickets/${id}/proposals`).doc(p.id).update({ status, resolvedAt: new Date().toISOString() });
    await ticketRef(id).update({ pendingProposals: Math.max(0, (t.pendingProposals || 1) - 1) });
  } catch (e) { handleWriteError(e); }
}
async function acceptProposal(id, p) {
  const t = S.tickets.get(id); if (!t) return;
  let ok = false;
  if (p.kind === "edit") ok = await applyChange(id, p.data, "Before accepting Claude's edit", "Change accepted");
  else if (p.kind === "move") ok = p.data.column !== "done" && await moveTicket(id, p.data.column, null);
  else if (p.kind === "result") {
    ok = await applyChange(id, { output: p.data.output, outputAt: new Date().toISOString(), verify: parseVerify(p.data.output), review: null,
      run: { status: "done", at: new Date().toISOString(), via: "chat" }, column: "check", order: orderFor("check", id, null) }, "Before accepting Claude's result", "Result accepted");
  } else if (window.acceptExtraProposal) ok = await window.acceptExtraProposal(id, p);
  if (ok) { await resolveProposal(id, p, "accepted"); addEvent(id, "You accepted Claude's proposal."); }
}
async function rejectProposal(id, p) { await resolveProposal(id, p, "rejected"); addEvent(id, "You rejected Claude's proposal."); }

/* Verify gate: every [verify] line in a result must be ticked before the result can be approved. */
function parseVerify(md) {
  const out = [];
  for (const line of String(md || "").split("\n")) {
    const m = /\[verify\]\s*[:\-–]?\s*(.+)/i.exec(line);
    if (m) { const text = m[1].replace(/^[*_\s]+|[*_\s]+$/g, "").trim(); if (text && !out.some((v) => v.text === text)) out.push({ text: text.slice(0, 300), checked: false }); }
  }
  return out.slice(0, 40);
}
function stepsDone(t) { const s = t.steps || []; return { done: s.filter((x) => x.done).length, total: s.length }; }
function cleanSteps(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((x) => typeof x === "string" ? { text: x } : x || {})
    .map((x) => ({ text: String(x.text || "").trim().slice(0, 160), hint: String(x.hint || "").trim().slice(0, 240), done: !!x.done })).filter((x) => x.text);
}
function parseStepsText(txt) {
  return cleanSteps(String(txt || "").split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean)
    .map((l) => { const m = l.split(/\s+[—–-]\s+|:\s+/); return { text: m[0], hint: m.slice(1).join(" — ") }; }));
}
function stepsToText(list) { return (list || []).map((s) => s.hint ? `${s.text} — ${s.hint}` : s.text).join("\n"); }
function questionsOpen(t) { return (t.questions || []).filter((q) => !q.answer).length; }
/* Send a ticket back to autopilot with answers and/or requested changes; it lands at the top of Queued. */
async function sendBack(t, { answers, changes }) {
  const now = new Date().toISOString();
  const questions = (t.questions || []).map((q, i) => (answers && answers[i] ? { ...q, answer: answers[i], answeredAt: now } : q));
  const parts = [];
  questions.forEach((q) => { if (q.answer && answers && answers.includes(q.answer)) parts.push(`Q: ${q.q}\nA: ${q.answer}`); });
  if (changes) parts.push(`Change request: ${changes}`);
  if (!parts.length) { toast("Write an answer or a change first."); return false; }
  const top = Math.min(0, ...sortedIn("ready").map((x) => x.order ?? 0)) - 1;
  const ok = await applyChange(t.id, { questions, notes: [...(t.notes || []), { text: parts.join("\n\n"), at: now }], revision: { text: parts.join("\n\n"), at: now }, column: "ready", order: top }, "Before sending back to autopilot", "Sent back. Autopilot picks it up on its next run.");
  if (ok) addEvent(t.id, "You sent this back to autopilot with answers or changes.");
  return ok;
}
function verifyOpen(t) { return (t.verify || []).filter((v) => !v.checked).length; }

/* Daily run cap. */
const usageRef = () => S.db.doc(`meta/usage-${todayISO()}`);
async function readUsage() { try { const s = await usageRef().get(); S.usage = s.exists ? s.data() : { runs: 0 }; } catch {} return S.usage; }
function runsLeft() { return Math.max(0, (Number(S.settings.dailyRunCap) || 0) - (S.usage.runs || 0)); }
async function countRun() {
  await readUsage();
  S.usage = { runs: (S.usage.runs || 0) + 1, at: new Date().toISOString() };
  try { await usageRef().set(S.usage); } catch {}
}
async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  try { await S.db.doc("meta/settings").set(S.settings); toast("Settings saved"); } catch (e) { handleWriteError(e); }
}

/* Run lock: a short lease so two tabs never run the same ticket at once. */
async function acquireLock(id) {
  try {
    const ref = S.db.doc(`locks/${id}`);
    const r = await ref.acquire({ holder: TAB_ID, ttlMs: 120000 });
    if (!r.acquired) return null;
    const timer = setInterval(() => { ref.acquire({ holder: TAB_ID, ttlMs: 120000 }).catch(() => {}); }, 60000);
    return { release: () => clearInterval(timer) };
  } catch { return { release() {} }; }
}

/* Backup: the whole board as one JSON file. */
async function exportBoard() {
  if (!S.downloads) { toast("Saving files isn't available in this view."); return; }
  const data = { exportedAt: new Date().toISOString(), settings: S.settings, plan: S.plan, memory: S.memory || null, tickets: [] };
  for (const t of S.tickets.values()) {
    let messages = [];
    try { messages = (await S.db.collection(`tickets/${t.id}/messages`).orderBy("at").limit(500).get()).docs.map((d) => d.data()); } catch {}
    data.tickets.push({ ...t, messages });
  }
  try { await S.downloads.save({ filename: `gta6-board-${todayISO()}.json`, data: JSON.stringify(data, null, 2) }); toast("Backup saved"); }
  catch (e) { if (!e || e.code !== "declined") toast("The backup couldn't be saved here."); }
}
