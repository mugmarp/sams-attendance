import { dayModel, eventProgress } from "./day-model.js";
import {
  $,
  escape,
  time,
  init,
  showError,
  notice,
  currentDate,
  day,
} from "./common.js";
import { studentData, attempts, queue, remove, sync } from "./offline.js";
import {
  operations,
  enqueueOperation,
  syncOperations,
} from "./register-offline.js";
const user = await init(["STUDENT"]);
let dayData = null,
  dayCached = false,
  candidateKey = "";
let classes = [],
  reviewAttempt = null;
const summaryView = location.pathname.endsWith("/summary");
function eventCard(event, title) {
  if (!event)
    return `<article class="card"><p class="eyebrow">${title}</p><h2>No upcoming class</h2><p class="small muted">A lecturer must publish dated classes before attendance can open.</p></article>`;
  const p = eventProgress(event, currentDate().getTime()),
    reference = event.kind === "REFERENCE";
  return `<article class="card live-class ${p.ongoing ? "is-current" : ""}"><p class="eyebrow">${escape(title)} · ${reference ? "Weekly plan" : "Enrolled class"}</p><h2>${escape(event.courseCode)} · ${escape(event.courseTitle)}</h2><p>${time(event.startTime)} – ${time(event.endTime)}</p><p>${escape(event.room || "Venue awaiting confirmation")}</p>${event.lecturer ? `<p class="small">${escape(event.lecturer)}</p>` : ""}<p class="class-countdown">${p.ongoing ? `${p.minutes} min remaining` : `Starts in ${p.minutes < 60 ? p.minutes + " min" : Math.floor(p.minutes / 60) + "h " + (p.minutes % 60) + "m"}`}</p>${p.ongoing && !event.timeReviewRequired ? `<progress max="100" value="${p.percent}" aria-label="Scheduled class progress"></progress>` : ""}<p class="small">${reference ? (event.timeReviewRequired ? "Source interval needs review; this is not an attendance class." : event.operatorReviewed ? "Class interval confirmed by the project operator; attendance still requires a dated class." : "Planned reference; attendance is not open from this entry.") : event.checkedIn ? "Attendance recorded" : event.hasActiveCode ? "Lecturer check-in is open" : "Lecturer check-in is not open"}</p></article>`;
}
function renderDay() {
  if (!dayData) return;
  const model = dayModel(
    classes,
    dayData.weekly.events,
    currentDate().getTime(),
  );
  const profile = dayData.profile;
  $("#academic-profile").innerHTML =
    `<strong>${escape(profile.name)}</strong><p>${escape(profile.regNo || "Registration awaiting confirmation")}</p><p class="small">${escape(profile.programme?.faculty?.name || "Faculty awaiting assignment")} · ${escape(profile.programme?.name || user.program || "Programme awaiting assignment")} · ${escape(profile.studyGroupKey || "Year / track awaiting review")}</p>${profile.needsPlacementReview ? '<p class="small">Ask the registrar to confirm your academic placement.</p>' : ""}`;
  $("#day-status").textContent = dayCached
    ? "Saved timetable · time display is an estimate while offline. Pending attendance still needs server acceptance."
    : "Live schedule · refreshes every 10 seconds while visible. Timetable progress does not prove attendance.";
  $("#now-next").innerHTML =
    model.current.map((e) => eventCard(e, "Happening now")).join("") +
    (!model.current.length
      ? '<article class="card"><p class="eyebrow">Happening now</p><h2>No class in progress</h2></article>'
      : "") +
    eventCard(model.next, "Next up");
  $("#class-conflict").hidden = !model.conflict;
  $("#class-conflict").textContent =
    "Your enrolled classes overlap. Confirm which class you are attending; this timetable conflict needs lecturer review.";
  $("#class-choice").hidden = !model.conflict;
  const select = $("#session"),
    old = select.value;
  // Keep only current enrolled candidates. Weekly or future entries cannot target a check-in.
  const key = JSON.stringify(model.active.map((c) => [c.id, c.checkedIn]));
  if (key !== candidateKey) {
    select.innerHTML =
      '<option value="">Confirm the overlapping class</option>' +
      model.active
        .map(
          (c) =>
            `<option value="${c.id}" ${c.checkedIn ? "disabled" : ""}>${escape(c.courseCode)} · ${time(c.startTime)}${c.checkedIn ? " · recorded" : ""}</option>`,
        )
        .join("");
    candidateKey = key;
  }
  const selected =
    model.target?.id || (model.active.some((c) => c.id === old) ? old : "");
  select.value = selected;
  if (old && old !== selected && $("#code").value) {
    $("#code").value = "";
    notice(
      "The active class changed. Check the class above before entering a new code.",
    );
  }
  const target = classes.find((c) => c.id === selected);
  $("#checkin-form").hidden = model.active.length === 0 || !!target?.checkedIn;
  $("#checkin-target").textContent = target
    ? `Attendance for ${target.courseCode} · ${target.courseTitle}`
    : "Confirm the overlapping class before entering its code.";
  const today = classes.filter(
    (c) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(
        new Date(c.startTime),
      ) === day(),
  );
  const list = today.length
    ? today
    : dayData.weekly.events.filter(
        (c) =>
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Kampala",
          }).format(new Date(c.startTime)) === day(),
      );
  $("#upcoming").innerHTML = list.length
    ? list
        .map(
          (c) =>
            `<li><strong>${escape(c.courseCode)} · ${escape(c.courseTitle)}</strong><p class="small">${time(c.startTime)} – ${time(c.endTime)} · ${escape(c.room || "Venue awaiting confirmation")}${c.kind === "REFERENCE" ? " · Weekly plan" : ""}</p></li>`,
        )
        .join("")
    : "<li>No published classes for today.</li>";
}
async function loadClasses() {
  try {
    // Retain the established snapshot/queue endpoint across this additive client update.
    const [result, context] = await Promise.all([
      studentData(user.id, "/student/sessions/upcoming"),
      studentData(user.id, "/student/day"),
    ]);
    classes = result.data;
    dayData = context.data;
    dayCached = result.cached || context.cached;
    renderDay();
    if (!dayCached) showError(null);
  } catch (error) {
    showError(error);
  }
}
async function renderQueue() {
  try {
    const all = await attempts(user.id);
    const reviews = await operations(user.id);
    const list = all.filter((a) => a.state !== "SYNCED");
    const receipts = all.filter((a) => a.state === "SYNCED").reverse();
    $("#receipts").innerHTML = receipts.length
      ? receipts
          .map(
            (a) =>
              `<p><strong>${escape(a.courseCode)} · confirmed</strong><br><span class="small">Server acknowledged ${time(a.acknowledgedAt)}. ${escape(a.status || "PRESENT")}${a.duplicate ? " · previously recorded" : ""}</span></p>`,
          )
          .join("")
      : "<p>No confirmations saved on this device.</p>";
    $("#queue").innerHTML = list.length
      ? list
          .map(
            (a) =>
              `<div class="queue-item"><strong>${escape(a.courseCode)} · ${a.state.toLowerCase()}</strong><p class="small">Saved ${time(a.createdAt)}. ${escape(a.error || "")}${a.state === "PENDING" && a.nextAttemptAt ? " Next retry " + time(a.nextAttemptAt) + "." : ""}</p>${a.state === "FAILED" ? '<p class="small">Ask your examiner to review this attempt. It has not been counted.</p>' : ""}${a.state === "FAILED" && !reviews.some((op) => op.payload.type === "STUDENT_CLAIM" && op.payload.sessionId === a.sessionId) ? `<button data-request-review="${escape(a.id)}">Request lecturer review</button>` : ""}<button class="text-button" data-remove="${escape(a.id)}">Remove saved attempt</button></div>`,
          )
          .join("")
      : "<p>No saved attempts.</p>";
    for (const button of $("#queue").querySelectorAll("[data-request-review]"))
      button.onclick = () => {
        reviewAttempt = all.find((a) => a.id === button.dataset.requestReview);
        $("#review-title").textContent =
          "Request attendance review · " + reviewAttempt.courseCode;
        $("#review-reason").value = "";
        $("#request-review").hidden = false;
        $("#review-reason").focus();
      };
    $("#send-pending").hidden = !list.some((a) => a.state === "PENDING");
    $("#queue")
      .querySelectorAll("[data-remove]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            remove(button.dataset.remove, user.id).catch(showError)),
      );
  } catch (error) {
    showError(error);
  }
}
async function flush() {
  try {
    await sync(user.id);
    await syncOperations(user.id);
    await loadReviewRequests();
    await loadClasses();
    await renderQueue();
  } catch (error) {
    showError(error);
  }
}
async function loadSummary() {
  try {
    const { data, cached } = await studentData(
      user.id,
      "/student/attendance/summary",
    );
    $("#summaries").innerHTML = data.length
      ? data
          .map(
            (c) =>
              `<article class="card"><div class="spread"><div><p class="code">${escape(c.courseCode)}</p><h2>${escape(c.courseTitle)}</h2><p class="small muted">${escape(c.academicYear)} · Semester ${c.semester}</p></div><strong class="stat">${c.attendancePct === null ? "—" : c.attendancePct.toFixed(1) + "%"}</strong></div><p>${c.presentCount} attended / ${c.totalSessions} completed classes</p><div class="progress"><div class="${c.eligible ? "met" : ""}" style="width:${c.attendancePct || 0}%"></div></div><p class="small">${c.attendancePct === null ? "Not assessed: no completed classes." : c.eligible ? "Attendance requirement met (at least " + (c.attendanceThreshold || 80) + "%)." : "Below the " + (c.attendanceThreshold || 80) + "% attendance requirement."}</p></article>`,
          )
          .join("")
      : '<div class="card">You are not enrolled in any courses. Contact your administrator.</div>';
    if (cached) showError(new Error("Showing your saved attendance summary."));
    else showError(null);
  } catch (error) {
    showError(error);
  }
}
async function loadReviewRequests() {
  try {
    const pending = (await operations(user.id)).filter(
      (op) => op.payload.type === "STUDENT_CLAIM",
    );
    $("#review-uploads").innerHTML = pending
      .map(
        (op) =>
          `<p><strong>${escape(op.labels.courseCode)} · ${escape(op.state.toLowerCase().replaceAll("_", " "))}</strong><br>${escape(op.state === "SYNCED" ? "Request delivered. See the current lecturer decision below." : op.result?.message || op.error || "Saved on this device; waiting to send.")}</p>`,
      )
      .join("");
    const { data, cached } = await studentData(
      user.id,
      "/student/attendance-claims",
    );
    $("#review-requests").innerHTML = data.length
      ? (cached ? "<p>Showing saved review decisions.</p>" : "") +
        data
          .map(
            (claim) =>
              `<div class="queue-item"><strong>${escape(claim.session.course.code)} · ${claim.status.toLowerCase()}</strong><p>${escape(claim.reason)}</p>${claim.decisionReason ? `<p>Lecturer decision: ${escape(claim.decisionReason)}</p>` : "<p>Waiting for your lecturer; not counted.</p>"}</div>`,
          )
          .join("")
      : "<p>No review requests.</p>";
  } catch (error) {
    $("#review-requests").textContent = "Reconnect to load review decisions.";
  }
}
if (user) {
  $("#review-section").hidden = false;
  await loadReviewRequests();
  setInterval(loadReviewRequests, 15000);
  addEventListener("sams:operations", () => {
    void loadReviewRequests();
    if (!summaryView) void renderQueue();
  });
  setInterval(() => {
    void syncOperations(user.id).catch(showError);
  }, 3000);
  $("#cancel-review").onclick = () => {
    $("#request-review").hidden = true;
  };
  $("#request-review").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await enqueueOperation(
        user.id,
        {
          type: "STUDENT_CLAIM",
          sessionId: reviewAttempt.sessionId,
          reason: $("#review-reason").value,
        },
        { courseCode: reviewAttempt.courseCode },
      );
      $("#request-review").hidden = true;
      notice("Review request saved. It does not count as attendance.");
      await syncOperations(user.id);
      await loadReviewRequests();
      await renderQueue();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  };
  if (summaryView) {
    $("#summary-view").hidden = false;
    await loadSummary();
    setInterval(loadSummary, 15000);
  } else {
    $("#checkin-view").hidden = false;
    await loadClasses();
    await renderQueue();
    setInterval(() => {
      if (!document.hidden) void loadClasses();
    }, 10000);
    setInterval(() => {
      if (!document.hidden) renderDay();
    }, 1000);
    addEventListener("focus", () => void loadClasses());
    addEventListener("online", () => void loadClasses());
    addEventListener("sams:queue", renderQueue);
    addEventListener("online", flush);
    addEventListener("focus", flush);
    setInterval(() => {
      void sync(user.id).catch(showError);
    }, 3000);
    $("#send-pending").onclick = flush;
    void flush();
    $("#code").oninput = () => {
      $("#code").value = $("#code").value.toUpperCase();
    };
    $("#checkin-form").onsubmit = async (event) => {
      event.preventDefault();
      const selected = $("#session").value,
        code = $("#code").value,
        button = $("#submit-checkin");
      button.disabled = true;
      notice("");
      showError(null);
      try {
        const saved = await queue({
          userId: user.id,
          sessionId: selected,
          code,
          courseCode:
            classes.find((s) => s.id === selected)?.courseCode || "Saved class",
        });
        $("#code").value = "";
        await sync(user.id);
        const result = (await attempts(user.id)).find((a) => a.id === saved.id);
        if (result?.state === "SYNCED")
          notice("Attendance recorded by the server.");
        else if (result?.state === "FAILED") showError(new Error(result.error));
        else
          notice(
            "Saved as pending. This is not recorded attendance. Reconnect before the code expires, or ask your examiner for a correction.",
          );
        await loadClasses();
        await renderQueue();
      } catch (error) {
        showError(
          error.identity
            ? error
            : new Error(
                "Could not complete this attempt. Check saved attempts before trying again. " +
                  error.message,
              ),
        );
      } finally {
        button.disabled = false;
      }
    };
  }
}
