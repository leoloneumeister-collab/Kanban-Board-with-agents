/* Rendering: dashboard, board, ticket dialog (Brief, Chat, Result, History), settings, and boot. */

function viewSorted(col) {
  const list = sortedIn(col);
  if (S.sortMode === "due") list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  else if (S.sortMode === "priority") list.sort((a, b) => (PRIO_RANK[a.priority] || 9) - (PRIO_RANK[b.priority] || 9) || (a.due || "9").localeCompare(b.due || "9"));
  else if (S.sortMode === "agent") list.sort((a, b) => (a.agent || "").localeCompare(b.agent || ""));
  return list;
}

/* ---------- header and dashboard ---------- */
function renderCountdown() {
  const n = daysUntil(LAUNCH);
  $("days").textContent = n > 0 ? n : "0";
  $("days-label").textContent = n > 1 ? "days to launch" : n === 1 ? "day to launch" : "GTA 6 is out";
}
function renderFilters() {
  const box = $("filters"); box.replaceChildren();
  const make = (id, label, color) => el("button", {
    class: "chip", type: "button", "aria-pressed": String(S.filter === id),
    onclick: () => { S.filter = id; renderFilters(); renderBoard(); },
  }, color ? el("span", { class: "dot", style: `background:${color}` }) : null, label);
  box.append(make("all", "All agents"));
  for (const [id, a] of Object.entries(AGENTS)) box.append(make(id, a.name, a.color));
}
function renderDeck() {
  const total = S.tickets.size;
  $("total").textContent = `${total} ticket${total === 1 ? "" : "s"}`;
  const pipe = $("pipeline"); pipe.replaceChildren(); const legend = $("legend"); legend.replaceChildren();
  for (const c of COLUMNS) {
    const n = ticketsIn(c.id).length;
    if (n && total) pipe.append(el("span", { style: `width:${(n / total) * 100}%;background:${c.color}`, title: `${c.name}: ${n}` }));
    legend.append(el("span", {}, el("i", { style: `background:${c.color}` }), `${c.name} `, el("b", { text: String(n) })));
  }
  const open = [...S.tickets.values()].filter((t) => t.column !== "done");
  const dueSoon = open.filter((t) => { const d = parseDate(t.due); return d && daysUntil(d) <= 3; }).length;
  const needYou = open.filter((t) => t.human || t.column === "review" || t.column === "check" || t.pendingProposals).length;
  $("k-due").textContent = dueSoon; $("kpi-due").classList.toggle("alert", dueSoon > 0);
  $("k-you").textContent = needYou;
  $("k-run").textContent = S.activeRuns.size;
  $("k-left").textContent = `${runsLeft()} of ${S.settings.dailyRunCap} runs left today`;
  const ready = ticketsIn("ready").length;
  const runBtn = $("run-all");
  runBtn.textContent = ready ? `Run ${ready} ready ticket${ready === 1 ? "" : "s"}` : "Run ready tickets";
  runBtn.disabled = !S.sample || !S.canWrite || S.runAllActive || !ready;
  runBtn.title = !S.sample ? "Claude isn't available in this view" : !ready ? "Approve tickets into Ready for agent first" : "";
  $("stop-all").hidden = S.activeRuns.size === 0;
  const conf = $("run-confirm");
  if (S.confirmRun) {
    const { ids, left } = S.confirmRun;
    conf.hidden = false;
    conf.replaceChildren(el("span", { text: `${ids.length} tickets are ready, but only ${left} run${left === 1 ? "" : "s"} are left today.` }),
      el("button", { class: "btn sm primary", type: "button", text: `Run the first ${left}`, onclick: () => { S.confirmRun = null; runQueue(ids.slice(0, left)); } }),
      el("button", { class: "btn sm", type: "button", text: "Cancel", onclick: () => { S.confirmRun = null; renderDeck(); } }));
  } else conf.hidden = true;
  $("smart-sort").disabled = !S.sample || !S.canWrite || !total;
  renderPlan();
}
function keyBtn(k) {
  const t = [...S.tickets.values()].find((x) => (x.key || x.id) === k);
  return t ? el("button", { class: "keylink", type: "button", text: k, onclick: () => openTicket(t.id) }) : el("span", { class: "label-sm", text: k });
}
function renderPlan() {
  const body = $("plan-body");
  if (!S.plan) return;
  $("plan-age").textContent = S.plan.at ? `Updated ${ago(S.plan.at)}` : "";
  const next = (S.plan.next || []).filter((n) => n && n.key);
  const sugg = (S.plan.suggestions || []).filter((s) => s && s.key && !s.applied && !s.dismissed);
  body.replaceChildren(
    el("p", { class: "plan-summary", text: S.plan.summary || "" }),
    S.plan.order && !S.plan.orderApplied && S.canWrite ? el("div", { class: "proposal-inline" },
      el("span", { text: "Claude proposes a new order for the columns." }),
      el("button", { class: "btn sm primary", type: "button", text: "Apply order", onclick: applyPlanOrder }),
      el("button", { class: "btn sm", type: "button", text: "Ignore", onclick: () => S.db.doc("meta/plan").update({ orderApplied: true }).catch(handleWriteError) })) : null,
    next.length ? el("div", { class: "section" }, el("h4", { text: "Do next" }),
      el("ol", { class: "next-list" }, next.map((n) => el("li", {}, keyBtn(n.key), el("span", { text: n.why || "" }))))) : null,
    sugg.length ? el("div", { class: "section" }, el("h4", { text: "Suggestions" }),
      el("ul", { class: "sugg-list" }, sugg.map((s) => el("li", {}, keyBtn(s.key), el("span", { class: "why", text: suggestionText(s) }),
        S.canWrite ? el("span", { class: "actions" },
          el("button", { class: "btn sm", type: "button", text: "Apply", onclick: () => applySuggestion(s) }),
          el("button", { class: "btn sm", type: "button", text: "Dismiss", onclick: () => markSuggestion(s, "dismissed") })) : null)))) : null);
}
function suggestionText(s) {
  const what = s.action === "move" ? `Move to ${colName(s.to)}` : s.action === "priority" ? `Set priority ${s.to}` : s.action === "due" ? `Change due date to ${fmtDate(s.to)}` : "";
  return [what, s.why].filter(Boolean).join(". ");
}
function renderMemory() {
  const box = $("memory-body"); if (!box) return;
  const m = S.memory || {}, p = S.memoryProposal;
  $("memory-age").textContent = m.updatedAt ? `Updated ${ago(m.updatedAt)}` : "Not set yet";
  const parts = [];
  if (p && p.changes && S.canWrite) {
    parts.push(el("div", { class: "proposal" },
      el("div", { class: "proposal-head" }, el("strong", { text: `Claude proposes a memory update from ${p.from}` }), el("span", { class: "muted", text: ago(p.at) })),
      p.why ? el("p", { class: "muted", style: "margin:0", text: p.why }) : null,
      ...Object.keys(p.changes).map((k) => el("div", { class: "diff-row" }, el("span", { class: "label-sm", text: (MEMORY_FIELDS.find((f) => f[0] === k) || [k, k])[1] }),
        el("div", { class: "diff-before", text: m[k] || "(empty)" }), el("div", { class: "diff-after", text: p.changes[k] }))),
      el("div", { class: "actions" },
        el("button", { class: "btn sm primary", type: "button", text: "Accept", onclick: acceptMemoryProposal }),
        el("button", { class: "btn sm", type: "button", text: "Reject", onclick: () => S.db.doc("meta/memoryProposal").delete().catch(handleWriteError) }))));
  }
  if (S.memoryEditing) {
    const inputs = {};
    parts.push(el("div", { class: "memory-grid" }, MEMORY_FIELDS.map(([k, label, hint]) => {
      const a = el("textarea", { id: "mem-" + k, rows: "2", placeholder: hint }); a.value = m[k] || ""; inputs[k] = a;
      return el("div", { class: "field" }, el("label", { for: a.id, text: label }), a);
    })), el("div", { class: "actions" },
      el("button", { class: "btn sm primary", type: "button", text: "Save memory", onclick: async () => {
        const data = { updatedAt: new Date().toISOString() };
        for (const [k] of MEMORY_FIELDS) data[k] = inputs[k].value.trim().slice(0, 600);
        try { await S.db.doc("meta/memory").set(data); S.memoryEditing = false; toast("Project memory saved"); renderMemory(); } catch (e) { handleWriteError(e); }
      } }),
      el("button", { class: "btn sm", type: "button", text: "Cancel", onclick: () => { S.memoryEditing = false; renderMemory(); } })));
  } else {
    const filled = MEMORY_FIELDS.filter(([k]) => m[k]);
    parts.push(filled.length
      ? el("dl", { class: "memory-list" }, filled.map(([k, label]) => [el("dt", { text: label }), el("dd", { text: m[k] })]))
      : el("p", { class: "muted", style: "margin:0", text: "Every agent reads this before it works. Fill it in once you've picked your angle in GTA-01, or approve a research result and let Claude propose it." }),
      S.canWrite ? el("div", {}, el("button", { class: "btn sm", type: "button", text: filled.length ? "Edit memory" : "Fill in memory", onclick: () => { S.memoryEditing = true; renderMemory(); } })) : null);
  }
  box.replaceChildren(...parts);
}
function renderSettings() {
  const box = $("settings-body"); if (!box) return;
  const cap = el("input", { id: "set-cap", type: "number", min: "0", max: "200", value: String(S.settings.dailyRunCap) });
  const rev = el("input", { id: "set-review", type: "checkbox", checked: !!S.settings.autoReview, disabled: !S.canWrite, onchange: (e) => saveSettings({ autoReview: e.target.checked }) });
  box.replaceChildren(
    el("label", { class: "verify-item", for: "set-review" }, rev, el("span", { text: "Reviewer agent checks every result and asks for one revision if it falls short. A run then uses up to 4 Claude requests instead of 1." })),
    el("div", { class: "field" }, el("label", { for: "set-cap", text: "Agent runs per day" }), cap,
      el("span", { class: "muted", style: "font-size:12px", text: "Stops runs once reached, to protect your Claude usage. Chat isn't counted." })),
    el("div", { class: "actions" },
      el("button", { class: "btn sm primary", type: "button", text: "Save", disabled: !S.canWrite, onclick: () => saveSettings({ dailyRunCap: Math.max(0, Math.min(200, Number(cap.value) || 0)) }) }),
      el("button", { class: "btn sm", type: "button", text: "Export backup", disabled: !S.downloads, onclick: exportBoard })));
}

/* ---------- board ---------- */
function renderBoard() {
  const board = $("board"); board.replaceChildren();
  if (S.loaded && S.tickets.size === 0) {
    board.style.display = "block";
    board.append(el("div", { class: "board-empty" }, el("p", { text: "No tickets yet. Use New ticket to add the first one." })));
    return;
  }
  board.style.display = "";
  for (const col of COLUMNS) {
    const list = viewSorted(col.id);
    const shown = list.filter((t) => S.filter === "all" || t.agent === S.filter);
    const cards = el("div", { class: "cards" });
    if (!S.loaded) cards.append(el("div", { class: "empty-col", text: "Loading tickets…" }));
    else if (!shown.length) cards.append(el("div", { class: "empty-col", text: list.length ? "No tickets for this agent" : "Drop a ticket here" }));
    for (const t of shown) cards.append(renderCard(t));
    const column = el("section", { class: "column", "aria-label": col.name },
      el("div", { class: "col-head" },
        el("div", { class: "col-title" }, el("h2", { text: col.name }), el("span", { class: "count", text: String(list.length) })),
        el("span", { class: "col-hint", text: col.hint })),
      cards);
    wireDrop(column, col.id);
    board.append(column);
  }
}
function cardFlags(t) {
  const f = [];
  if (S.activeRuns.has(t.id)) f.push(el("span", { class: "flag run pulse", text: "Working…" }));
  else if (t.run && t.run.status === "error") f.push(el("span", { class: "flag err", text: "Agent failed" }));
  else if (t.column === "doing") f.push(el("span", { class: "flag err", text: "Interrupted" }));
  else if (t.output && t.column === "check") f.push(el("span", { class: "flag ok", text: verifyOpen(t) ? `${verifyOpen(t)} to verify` : "Result ready" }));
  const blk = t.column !== "done" ? blockedBy(t) : [];
  if (blk.length) f.push(el("span", { class: "flag err", text: `Blocked by ${blk.map((d) => d.key || d.id).join(", ")}` }));
  if (t.pendingProposals) f.push(el("span", { class: "flag run", text: `${t.pendingProposals} proposal${t.pendingProposals === 1 ? "" : "s"}` }));
  return f;
}
function renderCard(t) {
  const a = AGENTS[t.agent]; const due = parseDate(t.due);
  const soon = due && t.column !== "done" && daysUntil(due) <= 2;
  const card = el("button", { class: "card" + (S.activeRuns.has(t.id) ? " working" : ""), type: "button", draggable: S.canWrite ? "true" : null, "data-id": t.id, onclick: () => openTicket(t.id) },
    el("div", { class: "card-top" }, el("span", { text: t.key || t.id }), el("span", { class: "prio " + (t.priority || ""), text: t.priority || "P3" })),
    el("div", { class: "card-title", text: t.title || "Untitled ticket" }),
    el("div", { class: "card-meta" },
      el("span", { class: "agent", style: `--agent-color:${a ? a.color : "var(--muted)"}`, text: a ? a.name : "No agent" }),
      el("span", { class: "due" + (soon ? " soon" : ""), text: fmtDate(t.due) }),
      t.chatCount ? el("span", { class: "flag chat", text: `${t.chatCount} msg` }) : null,
      t.human ? el("span", { class: "flag you", text: "Needs you" }) : null,
      cardFlags(t)));
  card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging"); });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  return card;
}
function wireDrop(column, colId) {
  column.addEventListener("dragover", (e) => { if (!S.canWrite) return; e.preventDefault(); column.classList.add("over"); });
  column.addEventListener("dragleave", (e) => { if (!column.contains(e.relatedTarget)) column.classList.remove("over"); });
  column.addEventListener("drop", (e) => {
    e.preventDefault(); column.classList.remove("over");
    const id = e.dataTransfer.getData("text/plain"); if (!S.tickets.has(id)) return;
    const t = S.tickets.get(id);
    if (colId === "done" && verifyOpen(t)) { toast(`Tick the ${verifyOpen(t)} [verify] items on the Result tab first.`); return; }
    const before = S.sortMode === "manual" ? e.target.closest(".card") : null;
    moveTicket(id, colId, before && before.dataset.id !== id ? before.dataset.id : null);
  });
}
function renderAll() { renderDeck(); renderBoard(); if (S.openId && !S.editing) renderDialog(); }

/* ---------- dialog ---------- */
function unsubscribeTicket() { for (const u of S.subs) u(); S.subs = []; S.subFor = null; S.messages = []; S.proposals = []; S.history = []; }
function subscribeTicket(id) {
  if (S.subFor === id) return;
  unsubscribeTicket(); S.subFor = id;
  if (!S.db) return;
  const rerender = (tab) => { if (S.openId === id && !S.editing && (!tab || tab.includes(S.tab))) renderDialog(); };
  S.subs.push(S.db.collection(`tickets/${id}/messages`).orderBy("at").limit(300).onSnapshot((snap) => { S.messages = snap.docs.map((d) => ({ id: d.id, ...d.data() })); rerender(["chat"]); }, () => {}));
  S.subs.push(S.db.collection(`tickets/${id}/proposals`).where("status", "==", "pending").onSnapshot((snap) => { S.proposals = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at || "").localeCompare(b.at || "")); rerender(); }, () => {}));
  S.subs.push(S.db.collection(`tickets/${id}/history`).orderBy("at", "desc").limit(30).onSnapshot((snap) => { S.history = snap.docs.map((d) => ({ id: d.id, ...d.data() })); rerender(["history"]); }, () => {}));
}
function openTicket(id) {
  S.openId = id; S.editing = false; S.tab = "brief";
  subscribeTicket(id); renderDialog();
  const d = $("dialog"); if (!d.open) d.showModal();
}
function closeDialog() { $("dialog").close(); }
function renderDialog() {
  const box = $("dlg");
  if (S.openId === "__new") { box.replaceChildren(...editForm(null)); return; }
  const t = S.tickets.get(S.openId);
  if (!t) { closeDialog(); return; }
  if (S.editing) { box.replaceChildren(...editForm(t)); return; }
  const keepScroll = box.querySelector(".dlg-body")?.scrollTop;
  const draft = $("chat-input")?.value;
  const parts = S.tab === "chat" ? chatTab(t) : S.tab === "result" ? resultTab(t) : S.tab === "history" ? historyTab(t) : briefTab(t);
  box.replaceChildren(dialogHead(t), ...parts);
  if (draft != null && $("chat-input")) $("chat-input").value = draft;
  const body = box.querySelector(".dlg-body");
  if (body) body.scrollTop = S.tab === "chat" ? body.scrollHeight : (keepScroll || 0);
}
function dialogHead(t) {
  const a = AGENTS[t.agent];
  const tabBtn = (id, label) => el("button", { class: "tab", type: "button", role: "tab", "aria-selected": String(S.tab === id), onclick: () => { S.tab = id; renderDialog(); } }, label);
  const chatN = S.messages.filter((m) => m.role !== "event").length;
  const editP = S.proposals.filter((p) => p.kind !== "result").length, resultP = S.proposals.filter((p) => p.kind === "result").length;
  return el("div", { class: "dlg-head" },
    el("div", { class: "card-top" }, el("span", { text: `${t.key || t.id} · ${t.phase || "No phase"} · ${a ? a.name : "No agent"}` }),
      el("button", { class: "btn sm close", type: "button", text: "Close", onclick: closeDialog })),
    el("h3", { id: "dlg-title", text: t.title }),
    el("div", { class: "tabs", role: "tablist" },
      tabBtn("brief", editP ? `Brief (${editP} to review)` : "Brief"),
      tabBtn("chat", chatN ? `Chat (${chatN})` : "Chat"),
      tabBtn("result", resultP ? `Result (${resultP} to review)` : t.output || S.activeRuns.has(t.id) ? "Result •" : "Result"),
      tabBtn("history", "History")));
}
function section(title, content, cls) {
  if (!content || (Array.isArray(content) && !content.length)) return null;
  return el("div", { class: "section" + (cls ? " " + cls : "") }, el("h4", { text: title }),
    Array.isArray(content) ? el("ul", {}, content.map((x) => el("li", { text: x }))) : el("p", { text: content }));
}
function valueText(k, v) {
  if (k === "dependsOn") return v && v.length ? v.join(", ") : "(none)";
  if (Array.isArray(v)) return v.length ? v.map((x) => "• " + x).join("\n") : "(empty)";
  if (k === "column") return colName(v);
  if (k === "agent") return AGENTS[v] ? AGENTS[v].name : v;
  if (k === "due") return v ? fmtDate(v) : "(none)";
  return v === "" || v == null ? "(empty)" : String(v);
}
function proposalCard(t, p) {
  const title = p.kind === "edit" ? "Claude proposes changes" : p.kind === "move" ? "Claude proposes a move" : p.kind === "result" ? "Claude proposes a result" : p.kind === "subtickets" ? `Claude proposes ${(p.data.tickets || []).length} new tickets` : "Claude proposes";
  const rows = p.kind === "result" ? [el("div", { class: "diff-after" }, mdNode(p.data.output))]
    : p.kind === "subtickets" ? [el("ol", { class: "sub-list" }, (p.data.tickets || []).map((x, i) => el("li", {},
        el("strong", { text: x.title }), el("span", { class: "muted", text: ` · ${(AGENTS[x.agent] || {}).name || x.agent}${x.due ? " · " + fmtDate(x.due) : ""}${x.after && x.after.length ? " · after " + x.after.map((n) => "#" + (n + 1)).join(", ") : ""}` }),
        el("div", { class: "small", text: x.goal }))))]
    : Object.keys(p.data || {}).map((k) => el("div", { class: "diff-row" }, el("span", { class: "label-sm", text: FIELD_NAMES[k] || k }),
      el("div", { class: "diff-before", text: valueText(k, p.old ? p.old[k] : "") }), el("div", { class: "diff-after", text: valueText(k, p.data[k]) })));
  return el("div", { class: "proposal" },
    el("div", { class: "proposal-head" }, el("strong", { text: title }), el("span", { class: "muted", text: ago(p.at) })),
    p.why ? el("p", { class: "muted", style: "margin:0", text: p.why }) : null,
    ...rows,
    S.canWrite ? el("div", { class: "actions" },
      el("button", { class: "btn sm primary", type: "button", text: "Accept", onclick: (e) => { e.currentTarget.disabled = true; acceptProposal(t.id, p); } }),
      el("button", { class: "btn sm", type: "button", text: "Reject", onclick: (e) => { e.currentTarget.disabled = true; rejectProposal(t.id, p); } })) : null);
}
function briefTab(t) {
  const colSelect = el("select", { id: "move-col", "aria-label": "Column", disabled: !S.canWrite, onchange: (e) => {
    if (e.target.value === "done" && verifyOpen(t)) { toast(`Tick the ${verifyOpen(t)} [verify] items on the Result tab first.`); e.target.value = t.column; return; }
    moveTicket(t.id, e.target.value, null);
  } }, COLUMNS.map((c) => el("option", { value: c.id, selected: c.id === t.column, text: c.name })));
  const noteInput = el("textarea", { id: "note-input", placeholder: "Add a review note, for example what to change before approving", rows: "2" });
  const notes = (t.notes || []).map((n) => el("div", { class: "note" }, el("time", { text: fmtTime(n.at) }), n.text));
  const body = el("div", { class: "dlg-body" },
    ...S.proposals.filter((p) => p.kind !== "result").map((p) => proposalCard(t, p)),
    el("div", { class: "facts" },
      el("div", { class: "fact" }, el("span", { text: "Column" }), colSelect),
      el("div", { class: "fact" }, el("span", { text: "Due" }), el("span", { text: fmtDate(t.due) })),
      el("div", { class: "fact" }, el("span", { text: "Priority" }), el("span", { text: t.priority || "-" }))),
    deps(t).length ? el("div", { class: "section" }, el("h4", { text: "Depends on" }),
      el("ul", { class: "next-list" }, deps(t).map((d) => el("li", {}, keyBtn(d.key || d.id), el("span", { text: d.title }),
        el("span", { class: "flag " + (d.column === "done" ? "ok" : "err"), text: d.column === "done" ? "Done, its result is shared with this agent" : colName(d.column) }))))) : null,
    section("Goal", t.goal), section("Context", t.context), section("Deliverable", t.deliverable),
    section("Acceptance criteria", t.acceptance), section("Out of scope", t.outOfScope), section("Needs you", t.human, "human"),
    el("div", { class: "section" }, el("h4", { text: "Review notes" }),
      notes.length ? el("div", { class: "notes" }, notes) : el("p", { class: "muted", text: "No notes yet." }),
      S.canWrite ? noteInput : null,
      S.canWrite ? el("div", {}, el("button", { class: "btn sm", type: "button", text: "Add note", onclick: async () => {
        const text = noteInput.value.trim(); if (!text) return;
        if (await write(t.id, { notes: [...(t.notes || []), { text, at: new Date().toISOString() }] }, "Note added")) noteInput.value = "";
      } })) : null));
  const foot = el("div", { class: "dlg-foot" },
    S.canWrite && t.column === "review" ? el("button", { class: "btn primary", type: "button", text: "Approve for agent", onclick: () => moveTicket(t.id, "ready", null) }) : null,
    el("button", { class: "btn", type: "button", text: "Chat about it", onclick: () => { S.tab = "chat"; renderDialog(); } }),
    el("button", { class: "btn", type: "button", text: "Copy brief", onclick: () => copyText(brief(t), "Brief copied") }),
    el("span", { class: "spacer" }),
    S.canWrite ? el("button", { class: "btn", type: "button", text: "Edit ticket", onclick: () => { S.editing = true; renderDialog(); } }) : null);
  return [body, foot];
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const ta = el("textarea", { readonly: true, "aria-label": "Text to copy" }); ta.value = text; ta.style.minHeight = "200px";
    $("dlg").querySelector(".dlg-body")?.prepend(ta); ta.select();
    toast("Copy is blocked here. The text is selected, copy it manually.");
  }
}
function chatTab(t) {
  const list = el("div", { class: "chat", "aria-live": "polite" });
  if (!S.messages.length && !S.chatPending) {
    const starter = (label, text) => el("button", { class: "chip", type: "button", text: label, onclick: () => sendChat(t.id, text) });
    list.append(el("div", { class: "chat-empty" },
      el("p", { style: "margin:0", text: S.sample ? "Talk to Claude about this ticket. Give it more context, ask it to sharpen the brief, or have it solve the ticket. Any change it suggests waits for your approval." : "Claude isn't available in this view. Open the board on claude.ai while signed in." }),
      S.sample && S.canWrite ? el("div", { class: "starters" },
        starter("Ask me what's missing", "Ask me up to 5 short questions that would make this ticket clearer for an agent. Number them."),
        starter("Sharpen the brief", "Rewrite this ticket so an agent can't misunderstand it. Propose the edit, then tell me in 3 lines what you changed."),
        starter("Solve it now", "Do this ticket now. Write the full deliverable, propose it as the result, then summarise it in 3 lines.")) : null));
  }
  for (const m of S.messages) {
    if (m.role === "event") list.append(el("div", { class: "msg event", text: m.text }));
    else if (m.role === "user") list.append(el("div", { class: "msg user", text: m.text }));
    else list.append(el("div", { class: "msg assistant" }, mdNode(m.text)));
  }
  if (S.chatPending) {
    if (S.chatPending.user) list.append(el("div", { class: "msg user", text: S.chatPending.user }));
    list.append(el("div", { class: "msg assistant", id: "chat-live" }, S.chatPending.text ? mdNode(S.chatPending.text) : el("span", { class: "muted pulse", text: S.chatPending.status || "Thinking…" })));
  }
  const input = el("textarea", { id: "chat-input", rows: "2", placeholder: S.sample ? "Message Claude about this ticket" : "Claude isn't available here", disabled: !S.sample || !S.canWrite || S.chatBusy,
    onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(t.id); } } });
  const foot = el("div", { class: "dlg-foot" }, el("div", { class: "composer" }, input,
    S.chatBusy ? el("button", { class: "btn", type: "button", text: "Stop", onclick: () => S.chatCtl && S.chatCtl.abort() })
      : el("button", { class: "btn primary", type: "button", text: "Send", disabled: !S.sample || !S.canWrite, onclick: () => sendChat(t.id) })));
  return [el("div", { class: "dlg-body" }, list), foot];
}
function verifyList(t) {
  const items = t.verify || []; if (!items.length) return null;
  return el("div", { class: "section verify" },
    el("h4", { text: `Check before approving · ${items.length - verifyOpen(t)} of ${items.length} done` }),
    ...items.map((v, i) => {
      const id = `verify-${i}`;
      return el("label", { class: "verify-item", for: id },
        el("input", { type: "checkbox", id, checked: v.checked, disabled: !S.canWrite, onchange: (e) => {
          const next = items.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x));
          write(t.id, { verify: next });
        } }), el("span", { text: v.text }));
    }));
}
function scorecard(t) {
  const r = t.review; if (!r || !r.criteria) return null;
  const met = r.criteria.filter((c) => c.met).length;
  return el("details", { class: "scorecard", open: r.score < 70 || (r.mustFix && r.mustFix.length) ? true : null },
    el("summary", {}, el("strong", { class: r.score >= 80 ? "ok" : r.score >= 60 ? "" : "err", text: `Reviewer score ${r.score}/100` }),
      el("span", { class: "muted", text: ` · ${met} of ${r.criteria.length} criteria met${r.revised ? ` · revised once (first draft ${r.firstScore})` : ""}` })),
    el("ul", { class: "crit-list" }, r.criteria.map((c) => el("li", { class: c.met ? "met" : "unmet" }, el("span", { class: "mark", text: c.met ? "Met" : "Not met" }), el("span", { text: c.text }), c.note ? el("span", { class: "muted", text: " · " + c.note }) : null))),
    r.mustFix && r.mustFix.length ? el("div", { class: "small" }, el("strong", { text: "Still to fix: " }), r.mustFix.join("; ")) : null);
}
function resultTab(t) {
  const run = S.activeRuns.get(t.id);
  const body = el("div", { class: "dlg-body" }, ...S.proposals.filter((p) => p.kind === "result").map((p) => proposalCard(t, p)));
  if (run) {
    body.append(el("div", { class: "result-meta" }, el("span", { class: "flag run pulse", text: "Agent is writing…" }), el("span", { text: "Keep this tab open until it finishes." })),
      el("div", { class: "live", id: "live-output", text: run.text || "Thinking. The first words can take up to a minute." }));
  } else if (t.output) {
    body.append(el("div", { class: "result-meta" }, el("span", { text: `Saved ${ago(t.outputAt)}` }), t.run && t.run.via === "chat" ? el("span", { text: "from the chat" }) : null),
      scorecard(t), verifyList(t), mdNode(t.output));
  } else {
    body.append(el("div", { class: "chat-empty" },
      el("p", { style: "margin:0", text: "No result yet. Run the agent to have Claude do this ticket, using the brief and everything you've said in the chat." }),
      t.run && t.run.status === "error" ? el("p", { class: "notice", style: "margin:0", text: t.run.message || "The last run failed." }) : null));
  }
  const open = verifyOpen(t);
  const stuck = !run && t.column === "doing";
  const blk = blockedBy(t);
  if (!run && blk.length && t.column !== "done") body.prepend(el("p", { class: "notice", style: "margin:0", text: `Waiting on ${blk.map((d) => d.key || d.id).join(", ")}. You can run it now, but the agent won't have their results.` }));
  const foot = el("div", { class: "dlg-foot" },
    run ? el("button", { class: "btn", type: "button", text: "Stop", onclick: () => run.ctl.abort() })
      : el("button", { class: "btn primary", type: "button", text: t.output ? "Run again" : "Run agent", disabled: !S.sample || !S.canWrite || stuck, onclick: () => runAgent(t.id) }),
    stuck && S.canWrite ? el("button", { class: "btn", type: "button", text: "Reset interrupted run", onclick: () => write(t.id, { column: "ready", order: orderFor("ready", t.id, null), run: { status: "stopped", at: new Date().toISOString() } }, "Moved back to Ready for agent") }) : null,
    !run && t.output && S.canWrite && t.column !== "done" ? el("button", { class: "btn", type: "button", text: open ? `Approve (${open} to verify)` : "Approve result", disabled: open > 0, title: open ? "Tick every [verify] item first" : "", onclick: async () => {
      if (await moveTicket(t.id, "done", null) && t.agent === "research" && S.sample) suggestMemory(S.tickets.get(t.id) || t);
    } }) : null,
    !run && t.output && S.canWrite && t.column === "done" && S.sample ? el("button", { class: "btn", type: "button", text: "Update project memory from this", onclick: () => suggestMemory(t) }) : null,
    !run && t.output && S.canWrite ? el("button", { class: "btn", type: "button", text: "Ask for changes", onclick: () => { S.tab = "chat"; renderDialog(); setTimeout(() => { const i = $("chat-input"); if (i) { i.value = "Change the result: "; i.focus(); } }, 0); } }) : null,
    el("span", { class: "spacer" }),
    !run && t.output ? el("button", { class: "btn", type: "button", text: "Copy result", onclick: () => copyText(t.output, "Result copied") }) : null);
  return [body, foot];
}
function historyTab(t) {
  const body = el("div", { class: "dlg-body" });
  if (!S.history.length) body.append(el("p", { class: "muted", text: "No earlier versions yet. A version is saved before every edit, accepted proposal and new result." }));
  for (const h of S.history) {
    const prev = h.ticket || {};
    const changed = EDITABLE.concat(["output", "column"]).filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(t[k] ?? null));
    body.append(el("div", { class: "history-item" },
      el("div", { class: "proposal-head" }, el("strong", { text: h.reason || "Saved version" }), el("span", { class: "muted", text: fmtTime(h.at) })),
      el("p", { class: "muted", style: "margin:0;font-size:13px", text: changed.length ? `Differs from now in: ${changed.map((k) => FIELD_NAMES[k] || k).join(", ")}` : "Same as the current ticket." }),
      S.canWrite && changed.length ? el("div", {}, el("button", { class: "btn sm", type: "button", text: "Restore this version", onclick: (e) => { e.currentTarget.disabled = true; restoreSnapshot(t.id, h); } })) : null));
  }
  return [body, el("div", { class: "dlg-foot" }, el("span", { class: "muted", style: "font-size:12px", text: "Restoring saves the current version first, so you can always go back." }))];
}

/* ---------- edit form ---------- */
function field(label, input) { return el("div", { class: "field" }, el("label", { for: input.id, text: label }), input); }
function editForm(t) {
  const v = t || { column: "backlog", agent: "research", priority: "P2", phase: "Pre-launch", acceptance: [] };
  const inp = (id, value, type = "text") => { const i = el("input", { id, type }); i.value = value || ""; return i; };
  const area = (id, value, rows = 3) => { const a = el("textarea", { id, rows: String(rows) }); a.value = value || ""; return a; };
  const sel = (id, options, value) => el("select", { id }, options.map(([val, label]) => el("option", { value: val, selected: val === value, text: label })));
  const f = {
    title: inp("f-title", v.title), agent: sel("f-agent", Object.entries(AGENTS).map(([k, a]) => [k, a.name]), v.agent),
    priority: sel("f-priority", PRIORITIES.map((p) => [p, p]), v.priority), phase: sel("f-phase", PHASES.map((p) => [p, p]), v.phase),
    due: inp("f-due", v.due, "date"), goal: area("f-goal", v.goal, 2), context: area("f-context", v.context, 4),
    deliverable: area("f-deliverable", v.deliverable, 3), acceptance: area("f-acceptance", (v.acceptance || []).join("\n"), 4),
    outOfScope: area("f-oos", v.outOfScope, 2), human: area("f-human", v.human, 2),
  };
  const depBoxes = [...S.tickets.values()].filter((x) => !t || x.id !== t.id).sort((a, b) => (a.key || a.id).localeCompare(b.key || b.id))
    .map((x) => { const key = x.key || x.id; return el("label", { class: "dep-item", for: "dep-" + key }, el("input", { type: "checkbox", id: "dep-" + key, value: key, checked: (v.dependsOn || []).includes(key) }), el("span", { text: `${key} ${x.title}` })); });
  const err = el("p", { class: "notice", hidden: true });
  const save = async () => {
    const title = f.title.value.trim();
    if (!title) { err.textContent = "Give the ticket a title before saving."; err.hidden = false; f.title.focus(); return; }
    const data = { title, agent: f.agent.value, priority: f.priority.value, phase: f.phase.value, due: f.due.value,
      goal: f.goal.value.trim(), context: f.context.value.trim(), deliverable: f.deliverable.value.trim(),
      acceptance: f.acceptance.value.split("\n").map((s) => s.trim()).filter(Boolean), outOfScope: f.outOfScope.value.trim(), human: f.human.value.trim(),
      dependsOn: depBoxes.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value) };
    try {
      if (t) { if (await applyChange(t.id, data, "Before your edit", "Ticket saved")) { S.editing = false; renderDialog(); } }
      else {
        const id = nextKey();
        await S.db.collection("tickets").doc(id).set({ ...data, key: id, column: "backlog", order: orderFor("backlog", id, null), notes: [] });
        toast("Ticket added to Backlog"); S.editing = false; openTicket(id);
      }
    } catch (e) { handleWriteError(e); }
  };
  const confirmBox = el("span", { hidden: true }, el("span", { text: "Delete for good? ", style: "font-size:13px" }),
    el("button", { class: "btn danger", type: "button", text: "Yes, delete", onclick: async () => {
      try { await S.db.collection("tickets").doc(t.id).delete(); toast("Ticket deleted"); closeDialog(); } catch (e) { handleWriteError(e); }
    } }));
  const head = el("div", { class: "dlg-head", style: "padding-bottom:12px" },
    el("div", { class: "card-top" }, el("span", { text: t ? `Editing ${t.key || t.id}` : "New ticket" }),
      el("button", { class: "btn sm close", type: "button", text: "Cancel", onclick: () => { if (t) { S.editing = false; renderDialog(); } else closeDialog(); } })),
    el("h3", { id: "dlg-title", text: t ? t.title : "Write a ticket an agent can act on" }));
  const body = el("div", { class: "dlg-body" }, err, field("Title", f.title),
    el("div", { class: "grid-2" }, field("Agent", f.agent), field("Priority", f.priority), field("Phase", f.phase), field("Due", f.due)),
    field("Goal: one sentence on the outcome", f.goal), field("Context: what the agent needs to know", f.context),
    field("Deliverable: what it hands back", f.deliverable), field("Acceptance criteria: one per line", f.acceptance),
    field("Out of scope", f.outOfScope), field("Needs you: what only you can do", f.human),
    el("div", { class: "field" }, el("span", { class: "label-sm", text: "Depends on: this agent gets their approved results" }), el("div", { class: "dep-grid" }, depBoxes)));
  const foot = el("div", { class: "dlg-foot" },
    el("button", { class: "btn primary", type: "button", text: t ? "Save changes" : "Add ticket", onclick: save }),
    el("span", { class: "spacer" }),
    t ? el("button", { class: "btn danger", type: "button", text: "Delete ticket", onclick: (e) => { e.currentTarget.hidden = true; confirmBox.hidden = false; } }) : null,
    confirmBox);
  return [head, body, foot];
}
function nextKey() {
  let max = 0;
  for (const t of S.tickets.values()) { const m = /^GTA-(\d+)$/.exec(t.key || t.id); if (m) max = Math.max(max, Number(m[1])); }
  return "GTA-" + String(max + 1).padStart(2, "0");
}

/* ---------- wiring and boot ---------- */
$("dialog").addEventListener("close", () => { S.openId = null; S.editing = false; unsubscribeTicket(); });
$("dialog").addEventListener("click", (e) => { if (e.target === $("dialog")) closeDialog(); });
$("new-ticket").addEventListener("click", () => {
  if (!S.db) { toast("The board can't save right now."); return; }
  unsubscribeTicket(); S.openId = "__new"; S.editing = true; renderDialog(); if (!$("dialog").open) $("dialog").showModal();
});
$("sort-mode").addEventListener("change", (e) => { S.sortMode = e.target.value; renderBoard(); });
$("run-all").addEventListener("click", requestRunAll);
$("stop-all").addEventListener("click", () => { S.stopAll = true; for (const r of S.activeRuns.values()) r.ctl.abort(); });
$("smart-sort").addEventListener("click", smartSort);
window.addEventListener("beforeunload", (e) => { if (S.activeRuns.size || S.chatBusy) { e.preventDefault(); e.returnValue = ""; } });

async function boot() {
  renderCountdown(); renderFilters(); renderAll(); renderSettings(); renderMemory();
  setInterval(renderCountdown, 60000);
  if (!window.claude || typeof window.claude.use !== "function") {
    S.loaded = true; notice("Open this board on claude.ai while signed in to load tickets and use Claude."); renderAll(); return;
  }
  const [db, sample, user, downloads] = await Promise.all(["db", "sample", "user", "downloads"].map((n) => window.claude.use(n)));
  S.db = db; S.sample = sample; S.downloads = downloads;
  if (sample) { try { const lim = await sample.limits(); S.toolsOk = !!(lim && lim.tools); } catch { S.toolsOk = false; } }
  if (!db) { S.loaded = true; $("new-ticket").disabled = true; notice("Tickets can't load in this view. Open the board on claude.ai while signed in."); renderAll(); return; }
  try { const can = user ? await user.can("data.write") : null; if (can === false) { S.canWrite = false; $("new-ticket").hidden = true; notice("You're viewing this board read-only."); } } catch {}
  if (!sample) notice("Claude features are off in this view. Open the board in claude.ai to chat with tickets and run agents.");
  db.collection("tickets").onSnapshot((snap) => {
    S.tickets = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    S.loaded = true; renderDeck(); renderBoard();
    if (S.openId && !S.editing && !(S.tab === "chat" && S.chatBusy)) renderDialog();
  }, (e) => { S.loaded = true; notice(e && e.code === "revoked" ? "Access to this board changed. Reload to continue." : "Live updates stopped. Reload the page to reconnect."); renderAll(); });
  db.doc("meta/plan").onSnapshot((snap) => { S.plan = snap.exists ? snap.data() : null; renderDeck(); }, () => {});
  db.doc("meta/memory").onSnapshot((snap) => { S.memory = snap.exists ? snap.data() : null; if (!S.memoryEditing) renderMemory(); }, () => {});
  db.doc("meta/memoryProposal").onSnapshot((snap) => { S.memoryProposal = snap.exists ? snap.data() : null; if (!S.memoryEditing) renderMemory(); }, () => {});
  db.doc("meta/settings").onSnapshot((snap) => { S.settings = { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}) }; renderDeck(); renderSettings(); }, () => {});
  await readUsage(); renderDeck();
}
boot();
