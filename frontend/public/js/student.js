import { api } from "./api.js";
import { $, escape, time, init, showError, notice } from "./common.js";
import { studentData, attempts, queue, remove, sync } from "./offline.js";
const user = await init(["STUDENT"]);
let classes = [];
const summaryView = location.pathname.endsWith("/summary");
async function loadClasses() {
  try {
    const result = await studentData(user.id, "/student/sessions/upcoming");
    classes = result.data;
    const selected = $("#session").value;
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
    const list = await attempts(user.id);
    $("#queue").innerHTML = list.length
      ? list
          .map(
            (a) =>
              `<div class="queue-item"><strong>${escape(a.courseCode)} · ${a.state.toLowerCase()}</strong><p class="small">Saved ${time(a.createdAt)}. ${escape(a.error || "")}</p>${a.state === "FAILED" ? '<p class="small">Ask your examiner to review this attempt. It has not been counted.</p>' : ""}<button class="text-button" data-remove="${escape(a.id)}">Remove saved attempt</button></div>`,
          )
          .join("")
      : "<p>No saved attempts.</p>";
    $("#send-pending").hidden = !list.some((a) => a.state === "PENDING");
    $("#queue")
      .querySelectorAll("[data-remove]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            remove(button.dataset.remove).catch(showError)),
      );
  } catch (error) {
    showError(error);
  }
}
async function flush() {
  try {
    await sync(user.id);
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
if (user) {
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
        await api("/student/checkin", {
          method: "POST",
          body: { sessionId: selected, code },
        });
        notice("Attendance recorded by the server.");
        $("#code").value = "";
        await remove(user.id + ":" + selected);
        await loadClasses();
      } catch (error) {
        if (error.network) {
          try {
            await queue({
              userId: user.id,
              sessionId: selected,
              code,
              courseCode:
                classes.find((s) => s.id === selected)?.courseCode ||
                "Saved class",
            });
            notice(
              "Saved as pending. This is not recorded attendance. Reconnect before the code expires, or ask your examiner for a correction.",
            );
            $("#code").value = "";
          } catch {
            showError(
              new Error(
                "Could not save on this device. Ask your examiner to record attendance.",
              ),
            );
          }
        } else showError(error);
      } finally {
        button.disabled = false;
      }
    };
  }
}
