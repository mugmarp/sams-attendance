import { $, escape, time, init, showError, notice } from "./common.js";
import { studentData, attempts, queue, remove, sync } from "./offline.js";
import {
  operations,
  enqueueOperation,
  syncOperations,
} from "./register-offline.js";
const user = await init(["STUDENT"]);
let classes = [],
  reviewAttempt = null;
const summaryView = location.pathname.endsWith("/summary");
async function loadClasses() {
  try {
    const result = await studentData(user.id, "/student/sessions/upcoming");
    classes = result.data;
    const selected =
      $("#session").value ||
      new URL(location.href).searchParams.get("sessionId");
    $("#session").innerHTML =
      '<option value="">Choose a class</option>' +
      classes
        .map(
          (s) =>
            `<option value="${s.id}" ${s.checkedIn ? "disabled" : ""}>${escape(s.courseCode)} · ${time(s.startTime)}${s.checkedIn ? " · recorded" : s.hasActiveCode ? " · check-in open" : ""}</option>`,
        )
        .join("");
    if (classes.some((s) => s.id === selected)) $("#session").value = selected;
    $("#upcoming").innerHTML = classes.length
      ? classes
          .map(
            (s) =>
              `<li class="spread"><div><strong>${escape(s.courseCode)} · ${escape(s.courseTitle)}</strong><p class="small muted">${time(s.startTime)} · ${escape(s.room || "Room TBA")}</p></div><span class="small">${s.checkedIn ? "Recorded" : s.hasActiveCode ? "Check-in open" : "Not open"}</span></li>`,
          )
          .join("")
      : "<li>No current or upcoming classes in the next 14 days.</li>";
    if (result.cached)
      showError(
        new Error(
          "Showing saved classes. Server confirmation is unavailable while offline.",
        ),
      );
    else showError(null);
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
    setInterval(loadClasses, 10000);
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
