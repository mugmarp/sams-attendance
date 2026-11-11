import { api, retryable } from "./api.js";
import {
  $,
  escape,
  time,
  day,
  init,
  showError,
  notice,
  currentDate,
} from "./common.js";
import {
  savedRegisters,
  savedRegister,
  prepare,
  operations,
  saveMark,
  enqueueOperation,
  syncOperations,
  keepServer,
} from "./register-offline.js";
const user = await init(["EXAMINER", "ADMIN"]);
let current = null,
  roster = [],
  cached = false,
  storageAvailable = true,
  prepared = null,
  local = [],
  claims = [],
  selectedStudent = null,
  pendingAction = null,
  intent = null;
const sessionId = location.pathname.includes("/session/")
  ? location.pathname.split("/").pop()
  : null;
const unresolved = (op) =>
  ["PENDING", "CONFLICT", "NEEDS_REVIEW", "DENIED"].includes(op.state);
async function savedClasses() {
  const bundles = await savedRegisters(user.id);
  $("#saved-classes").innerHTML = bundles.length
    ? bundles
        .map(
          (b) =>
            `<p><a href="/examiner/session/${escape(b.session.id)}">${escape(b.session.courseCode)} · ${time(b.session.startTime)}</a> · saved ${time(b.createdAt)}</p>`,
        )
        .join("")
    : "<p>No classes prepared on this device.</p>";
}
async function loadDashboard() {
  try {
    const classes = await api(
      "/examiner/sessions/today?date=" + $("#date").value,
      { expectedUserId: user.id },
    );
    $("#classes").innerHTML = classes.length
      ? classes
          .map(
            (s) =>
              `<a class="card course" href="/examiner/session/${s.id}"><div class="spread"><span class="code">${escape(s.courseCode)}</span><span class="badge">${s.status.toLowerCase()}</span></div><h2>${escape(s.courseTitle)}</h2><p class="small muted">${time(s.startTime)} – ${time(s.endTime)} · ${escape(s.room || "Room TBA")}</p><p>${s.hasActiveCode ? "Check-in is open" : "Open class →"}</p></a>`,
          )
          .join("")
      : '<div class="card">No classes on this date. Select another date or create a class below.</div>';
    showError(null);
  } catch (error) {
    showError(error);
  }
  try {
    await savedClasses();
  } catch (error) {
    showError(error);
  }
}
function renderCode() {
  if (!current) return;
  const now = currentDate().getTime();
  const code =
    !cached &&
    current.activeCode &&
    new Date(current.activeCode.expiresAt).getTime() > now
      ? current.activeCode
      : null;
  const inProgress =
    !cached &&
    current.status === "SCHEDULED" &&
    now >= new Date(current.startTime).getTime() &&
    now < new Date(current.endTime).getTime();
  $("#checkin-panel").innerHTML = code
    ? `<div class="code-panel"><p>Current code</p><p class="large-code" aria-label="Current check-in code">${escape(code.code)}</p><p class="small">Changes in ${Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - now) / 1000))}s · window closes ${time(code.closesAt)}</p></div>`
    : `<p>${cached ? "Saved roster available. Live check-in and class actions need a server connection." : inProgress ? "Check-in is closed. Open a ten-minute window when students are ready." : "Check-in can only open while this scheduled class is in progress."}</p>`;
  $("#start").hidden = !!code;
  $("#start").disabled = !inProgress;
  $("#stop").hidden = !code;
  $("#complete").hidden = current.status !== "SCHEDULED";
  $("#complete").disabled =
    cached || !storageAvailable || now < new Date(current.startTime).getTime();
  $("#cancel").hidden = current.status !== "SCHEDULED";
  $("#cancel").disabled = cached;
}
async function renderRegister() {
  if (!current) return;
  try {
    prepared = await savedRegister(user.id, sessionId);
    local = await operations(user.id, sessionId);
    storageAvailable = true;
  } catch (error) {
    prepared = null;
    local = [];
    storageAvailable = false;
    showError(
      new Error(
        "Device storage is unavailable. Online corrections remain available. " +
          error.message,
      ),
    );
  }
  $("#prepared-state").textContent = prepared
    ? `Roster saved ${time(prepared.createdAt)}; expires ${time(prepared.expiresAt)}.`
    : "Prepare this class online before an outage.";
  $("#prepare-register").disabled =
    cached ||
    !storageAvailable ||
    current.status !== "SCHEDULED" ||
    local.some((op) => op.state === "PENDING");
  $("#register-source").textContent = cached
    ? "Showing the saved register. Accepted records below are last confirmed values; pending marks do not count."
    : "Showing server-confirmed attendance. Pending marks are shown separately.";
  const visible = roster.map((row) => {
    if (!cached) return row;
    const accepted = local
      .filter(
        (op) =>
          op.state === "SYNCED" &&
          op.result?.attendance?.studentId === row.student.id,
      )
      .map((op) => op.result.attendance)
      .sort((a, b) => b.version - a.version)[0];
    return accepted && accepted.version > (row.attendance?.version || 0)
      ? { ...row, attendance: { ...accepted, changes: [] } }
      : row;
  });
  $("#class-count").textContent =
    `${visible.filter((r) => r.attendance && ["PRESENT", "LATE"].includes(r.attendance.status)).length} / ${visible.length} attended`;
  $("#roster").innerHTML = visible
    .map((row) => {
      const pending = local.find(
        (op) => op.payload.studentId === row.student.id && unresolved(op),
      );
      const canSave =
        prepared &&
        Date.parse(prepared.expiresAt) > Date.now() &&
        current.status === "SCHEDULED" &&
        !pending &&
        !local.some(
          (op) =>
            op.payload.studentId === row.student.id &&
            op.payload.preparationId === prepared.preparationId &&
            op.state === "SYNCED",
        );
      const future =
        currentDate().getTime() < new Date(current.startTime).getTime();
      return `<tr><td><strong>${escape(row.student.name)}</strong><br><span class="small">${escape(row.student.regNo)}</span></td><td>${escape(row.attendance?.status || (current.status === "COMPLETED" ? "ABSENT (no record)" : "Not recorded"))}${pending ? `<p class="small">${escape(pending.state.toLowerCase().replaceAll("_", " "))}: ${escape(pending.payload.status || "review decision")}</p>` : ""}</td><td>${row.attendance ? escape(row.attendance.method) + " · " + time(row.attendance.recordedAt) : "—"}${row.attendance?.changes?.length ? `<details><summary>Change history</summary>${row.attendance.changes.map((c) => `<p>${escape(c.actor.name)}: ${escape(c.previousStatus || "unrecorded")} → ${escape(c.status)}. ${escape(c.reason)} (${time(c.recordedAt)})</p>`).join("")}</details>` : ""}</td><td><button data-correct="${row.student.id}" ${cached || future || current.status === "CANCELLED" ? "disabled" : ""}>Correct</button> <button data-local="${row.student.id}" ${!canSave || future ? "disabled" : ""}>Save offline mark</button></td></tr>`;
    })
    .join("");
  for (const button of $("#roster").querySelectorAll("[data-correct]"))
    button.onclick = () => openForm(button.dataset.correct, { type: "ONLINE" });
  for (const button of $("#roster").querySelectorAll("[data-local]"))
    button.onclick = () => openForm(button.dataset.local, { type: "MARK" });
  $("#register-outbox").innerHTML = local.length
    ? local
        .map(
          (op) =>
            `<div class="queue-item"><strong>${escape(op.labels.studentName || "Review request")} · ${escape(op.state.toLowerCase().replaceAll("_", " "))}</strong><p>${escape(op.result?.message || op.error || "Saved on this device; not yet counted.")}</p>${op.result?.receivedAt ? `<p class="small">Server receipt ${time(op.result.receivedAt)}</p>` : ""}${["CONFLICT", "NEEDS_REVIEW"].includes(op.state) && ["MARK", "REVIEW_MARK"].includes(op.payload.type) ? `<button data-review="${op.id}">Review saved proposal</button>` : ""}${["CONFLICT", "NEEDS_REVIEW", "DENIED"].includes(op.state) ? `<button data-keep="${op.id}">Keep server record</button>` : ""}</div>`,
        )
        .join("")
    : "<p>No saved marks for this class.</p>";
  for (const button of $("#register-outbox").querySelectorAll("[data-keep]"))
    button.onclick = () =>
      keepServer(user.id, button.dataset.keep).catch(showError);
  for (const button of $("#register-outbox").querySelectorAll("[data-review]"))
    button.onclick = () =>
      reviewProposal(button.dataset.review).catch(showError);
  renderCode();
}
function openForm(studentId, action, comparison = "") {
  const row =
    roster.find((r) => r.student.id === studentId) ||
    (action.type === "CLAIM_DECISION"
      ? {
          student: claims.find((c) => c.studentId === studentId)?.student,
          attendance: null,
        }
      : null);
  if (!row?.student) throw new Error("Student is not in the current roster.");
  selectedStudent = studentId;
  intent = action;
  $("#correction-title").textContent =
    (action.type === "ONLINE"
      ? "Correct attendance"
      : action.type === "CLAIM_DECISION"
        ? "Review attendance request"
        : action.type === "REVIEW_MARK"
          ? "Review saved mark"
          : "Save attendance locally") +
    " · " +
    row.student.name;
  $("#comparison").textContent = comparison;
  $("#attendance-status").value =
    action.status || row.attendance?.status || "PRESENT";
  Array.from($("#attendance-status").options).find(
    (option) => option.value === "ABSENT",
  ).disabled = action.type === "CLAIM_DECISION";
  if (
    action.type === "CLAIM_DECISION" &&
    $("#attendance-status").value === "ABSENT"
  )
    $("#attendance-status").value = "PRESENT";
  $("#reason").value = "";
  $("#claim-decision-field").hidden = action.type !== "CLAIM_DECISION";
  $("#claim-decision").querySelector('option[value="APPROVE"]').disabled =
    false;
  $("#claim-decision").value = "APPROVE";
  $("#save-correction").textContent =
    action.type === "ONLINE"
      ? "Save correction"
      : action.type === "MARK"
        ? "Save on this device"
        : "Confirm reviewed decision";
  $("#correction").hidden = false;
  $("#reason").focus();
}
async function reviewProposal(id) {
  const op = local.find((item) => item.id === id);
  const bundle = await prepare(user.id, sessionId, "REVIEW");
  const row = bundle.roster.find((r) => r.student.id === op.payload.studentId);
  if (!row)
    throw new Error(
      "The student is no longer enrolled. Keep the server record and contact the registrar.",
    );
  roster = bundle.roster;
  openForm(
    row.student.id,
    {
      type: "REVIEW_MARK",
      preparationId: bundle.preparationId,
      reviewOf: op.id,
      baseSessionVersion: bundle.session.version,
      baseAttendanceVersion: row.attendance?.version || 0,
      status: op.payload.status,
    },
    `Current server record: ${row.attendance?.status || "Not recorded"} (version ${row.attendance?.version || 0}). Saved proposal: ${op.payload.status}. Explain why the new decision is correct.`,
  );
}
async function loadClaims() {
  try {
    claims = await api(`/examiner/sessions/${sessionId}/claims`, {
      expectedUserId: user.id,
    });
    $("#claims").innerHTML = claims.length
      ? claims
          .map(
            (claim) =>
              `<div class="queue-item"><strong>${escape(claim.student.name)} · ${claim.status.toLowerCase()}</strong><p>${escape(claim.reason)}</p>${claim.status === "PENDING" ? `<button data-claim="${claim.id}">Review request</button>` : `<p>${escape(claim.decisionReason)} · ${time(claim.decidedAt)}</p>`}</div>`,
          )
          .join("")
      : "<p>No review requests.</p>";
    for (const button of $("#claims").querySelectorAll("[data-claim]"))
      button.onclick = async () => {
        try {
          await loadSession();
          if (cached)
            throw new Error(
              "Reconnect to inspect the current register before deciding.",
            );
          const latest = await api(`/examiner/sessions/${sessionId}/claims`, {
            expectedUserId: user.id,
          });
          claims = latest;
          const claim = latest.find((c) => c.id === button.dataset.claim);
          if (claim?.status !== "PENDING") {
            await loadClaims();
            return;
          }
          const row = roster.find((r) => r.student.id === claim.studentId);
          openForm(
            claim.studentId,
            {
              type: "CLAIM_DECISION",
              claimId: claim.id,
              baseClaimVersion: claim.version,
              baseSessionVersion: current.version,
              baseAttendanceVersion: row?.attendance?.version || 0,
            },
            `Student request: ${claim.reason}. Current server record: ${row?.attendance?.status || "Not recorded"}. ${row ? "Approval records attendance; rejection leaves it unchanged." : "This student is no longer enrolled. Only rejection is available; contact the registrar about enrollment."}`,
          );
          if (!row) {
            $("#claim-decision").value = "REJECT";
            $("#claim-decision").querySelector(
              'option[value="APPROVE"]',
            ).disabled = true;
          }
        } catch (error) {
          showError(error);
        }
      };
  } catch (error) {
    $("#claims").textContent = "Review requests require a server connection.";
  }
}
async function loadSession() {
  try {
    [current, roster] = await Promise.all([
      api("/examiner/sessions/" + sessionId, { expectedUserId: user.id }),
      api("/examiner/sessions/" + sessionId + "/attendance", {
        expectedUserId: user.id,
      }),
    ]);
    cached = false;
    showError(null);
  } catch (error) {
    if (!retryable(error)) {
      showError(error);
      return;
    }
    const bundle = await savedRegister(user.id, sessionId);
    if (!bundle) {
      showError(
        new Error(
          "No prepared roster is available. Reconnect and prepare this class before an outage.",
        ),
      );
      return;
    }
    current = bundle.session;
    roster = bundle.roster;
    cached = true;
  }
  $("#class-title").textContent =
    current.courseCode + " · " + current.courseTitle;
  $("#course-report-link").href = "/examiner/report/" + current.courseId;
  $("#class-subtitle").textContent =
    `${time(current.startTime)} – ${time(current.endTime)} · ${current.room || "Room TBA"} · ${current.status.toLowerCase()}`;
  await renderRegister();
}
async function action(name, body) {
  try {
    if (name === "complete" && local.some(unresolved))
      throw new Error(
        "Resolve saved marks and conflicts before completing this class.",
      );
    await api(`/examiner/sessions/${sessionId}/${name}`, {
      method: "POST",
      body,
      expectedUserId: user.id,
    });
    $("#confirmation").hidden = true;
    $("#correction").hidden = true;
    pendingAction = null;
    await loadSession();
  } catch (error) {
    showError(error);
  }
}
async function flush() {
  try {
    await syncOperations(user.id);
    await loadSession();
    await loadClaims();
  } catch (error) {
    showError(error);
  }
}
if (user) {
  if (sessionId) {
    $("#session-view").hidden = false;
    await loadSession();
    await loadClaims();
    setInterval(() => {
      void loadSession().catch(showError);
    }, 5000);
    setInterval(renderCode, 1000);
    setInterval(() => {
      if (navigator.onLine) void loadClaims();
    }, 15000);
    setInterval(() => {
      void syncOperations(user.id).catch(showError);
    }, 3000);
    addEventListener("online", flush);
    addEventListener("focus", flush);
    addEventListener("sams:operations", () => {
      void renderRegister().catch(showError);
    });
    $("#prepare-register").onclick = async () => {
      try {
        await prepare(user.id, sessionId);
        await renderRegister();
        notice("Roster saved on this device for offline use.");
      } catch (error) {
        showError(error);
      }
    };
    $("#sync-register").onclick = flush;
    void syncOperations(user.id).catch(showError);
    $("#start").onclick = () => action("start-checkin");
    $("#stop").onclick = () => action("stop-checkin");
    for (const name of ["complete", "cancel"])
      $("#" + name).onclick = () => {
        pendingAction = name;
        $("#confirmation-text").textContent =
          name === "complete"
            ? "Completing this class includes it in attendance percentages. Resolve this device's saved work first. Unsynchronized marks on other devices will require review. This class cannot be reopened."
            : "Cancelling excludes this class from attendance percentages. Saved marks cannot be accepted for a cancelled class. This class cannot be reopened.";
        $("#confirm").textContent = "Confirm " + name;
        $("#confirmation").hidden = false;
      };
    $("#dismiss").onclick = () => {
      $("#confirmation").hidden = true;
      pendingAction = null;
    };
    $("#confirm").onclick = () => pendingAction && action(pendingAction);
    $("#correction-form").onsubmit = async (event) => {
      event.preventDefault();
      const button = $("#save-correction");
      button.disabled = true;
      try {
        const status = $("#attendance-status").value,
          reason = $("#reason").value;
        if (intent.type === "ONLINE")
          await action("attendance", {
            studentId: selectedStudent,
            status,
            reason,
          });
        else {
          if (intent.type === "MARK")
            await saveMark(user.id, sessionId, selectedStudent, status, reason);
          else
            await enqueueOperation(
              user.id,
              {
                ...intent,
                sessionId,
                studentId: selectedStudent,
                status,
                ...(intent.type === "CLAIM_DECISION"
                  ? { decision: $("#claim-decision").value }
                  : {}),
                reason,
              },
              {
                courseCode: current.courseCode,
                studentName: roster.find(
                  (r) => r.student.id === selectedStudent,
                )?.student.name,
              },
            );
          $("#correction").hidden = true;
          notice(
            "Decision saved locally. It counts only after server acceptance.",
          );
          await syncOperations(user.id);
          await renderRegister();
          if (navigator.onLine) await loadSession();
          await loadClaims();
        }
      } catch (error) {
        showError(error);
      } finally {
        button.disabled = false;
      }
    };
    $("#close-correction").onclick = () => {
      $("#correction").hidden = true;
    };
  } else {
    $("#dashboard").hidden = false;
    $("#date").value = day();
    $("#date").onchange = loadDashboard;
    await loadDashboard();
    setInterval(loadDashboard, 10000);
  }
}
if (user && !sessionId) {
  try {
    const courses = await api("/examiner/courses");
    $("#create-course").innerHTML =
      '<option value="">Choose a course</option>' +
      courses
        .map(
          (c) =>
            `<option value="${c.id}">${escape(c.code)} · ${escape(c.title)}</option>`,
        )
        .join("");
  } catch (error) {
    showError(error);
  }
  const inputDate = (date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Kampala",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  $("#create-start").value = inputDate(currentDate());
  $("#create-end").value = inputDate(
    new Date(currentDate().getTime() + 3600000),
  );
  $("#create-session").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const created = await api(
        "/examiner/courses/" + $("#create-course").value + "/sessions",
        {
          method: "POST",
          body: {
            startTime: new Date(
              $("#create-start").value + ":00+03:00",
            ).toISOString(),
            endTime: new Date(
              $("#create-end").value + ":00+03:00",
            ).toISOString(),
            room: $("#create-room").value,
            sessionType: $("#create-type").value,
          },
        },
      );
      location.assign("/examiner/session/" + created.id);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  };
}
