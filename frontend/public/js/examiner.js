import { api } from "./api.js";
import { $, escape, time, day, init, showError } from "./common.js";
const user = await init(["EXAMINER", "ADMIN"]);
let current = null,
  roster = [],
  selectedStudent = null,
  pendingAction = null;
const sessionId = location.pathname.includes("/session/")
  ? location.pathname.split("/").pop()
  : null;
async function loadDashboard() {
  try {
    const classes = await api(
      "/examiner/sessions/today?date=" + $("#date").value,
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
}
function renderCode() {
  if (!current) return;
  const now = Date.now(),
    code =
      current.activeCode &&
      new Date(current.activeCode.expiresAt).getTime() > now
        ? current.activeCode
        : null;
  const inProgress =
    current.status === "SCHEDULED" &&
    now >= new Date(current.startTime).getTime() &&
    now < new Date(current.endTime).getTime();
  $("#checkin-panel").innerHTML = code
    ? `<div class="code-panel"><p>Current code</p><p class="large-code" aria-label="Current check-in code">${escape(code.code)}</p><p class="small">Changes in ${Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - now) / 1000))}s · window closes ${time(code.closesAt)}</p></div>`
    : `<p>${inProgress ? "Check-in is closed. Open a ten-minute window when students are ready." : "Check-in can only open while this scheduled class is in progress."}</p>`;
  $("#start").hidden = !!code;
  $("#start").disabled = !inProgress;
  $("#stop").hidden = !code;
  $("#complete").hidden = current.status !== "SCHEDULED";
  $("#complete").disabled = now < new Date(current.startTime).getTime();
  $("#cancel").hidden = current.status !== "SCHEDULED";
}
async function loadSession() {
  try {
    [current, roster] = await Promise.all([
      api("/examiner/sessions/" + sessionId),
      api("/examiner/sessions/" + sessionId + "/attendance"),
    ]);
    $("#class-title").textContent =
      current.courseCode + " · " + current.courseTitle;
    $("#course-report-link").href = "/examiner/report/" + current.courseId;
    $("#class-subtitle").textContent =
      `${time(current.startTime)} – ${time(current.endTime)} · ${current.room || "Room TBA"} · ${current.status.toLowerCase()}`;
    $("#class-count").textContent =
      `${roster.filter((r) => r.attendance && ["PRESENT", "LATE"].includes(r.attendance.status)).length} / ${roster.length} attended`;
    $("#roster").innerHTML = roster
      .map(
        (row) =>
          `<tr><td><strong>${escape(row.student.name)}</strong><br><span class="small">${escape(row.student.regNo)}</span></td><td>${escape(row.attendance?.status || (current.status === "COMPLETED" ? "ABSENT (no record)" : "Not recorded"))}</td><td>${row.attendance ? escape(row.attendance.method) + " · " + time(row.attendance.recordedAt) : "—"}${row.attendance?.changes.length ? `<details><summary>Change history</summary>${row.attendance.changes.map((c) => `<p>${escape(c.actor.name)}: ${escape(c.previousStatus || "unrecorded")} → ${escape(c.status)}. ${escape(c.reason)} (${time(c.recordedAt)})</p>`).join("")}</details>` : ""}</td><td><button data-student="${row.student.id}" ${current.status === "CANCELLED" || Date.now() < new Date(current.startTime).getTime() ? "disabled" : ""}>Correct</button></td></tr>`,
      )
      .join("");
    $("#roster")
      .querySelectorAll("[data-student]")
      .forEach(
        (button) =>
          (button.onclick = () => {
            const row = roster.find(
              (r) => r.student.id === button.dataset.student,
            );
            selectedStudent = row.student.id;
            $("#correction-title").textContent =
              "Correct attendance · " + row.student.name;
            $("#attendance-status").value = row.attendance?.status || "PRESENT";
            $("#reason").value = "";
            $("#correction").hidden = false;
            $("#reason").focus();
          }),
      );
    renderCode();
    showError(null);
  } catch (error) {
    showError(error);
  }
}
async function action(name, body) {
  try {
    await api(`/examiner/sessions/${sessionId}/${name}`, {
      method: "POST",
      body,
    });
    $("#confirmation").hidden = true;
    $("#correction").hidden = true;
    pendingAction = null;
    await loadSession();
  } catch (error) {
    showError(error);
  }
}
if (user) {
  if (sessionId) {
    $("#session-view").hidden = false;
    await loadSession();
    setInterval(loadSession, 5000);
    setInterval(renderCode, 1000);
    $("#start").onclick = () => action("start-checkin");
    $("#stop").onclick = () => action("stop-checkin");
    for (const name of ["complete", "cancel"])
      $("#" + name).onclick = () => {
        pendingAction = name;
        $("#confirmation-text").textContent =
          name === "complete"
            ? "Completing this class closes check-in and includes it in attendance percentages. Missing records count as absent. This class cannot be reopened."
            : "Cancelling closes check-in and excludes this class from attendance percentages. This class cannot be reopened.";
        $("#confirm").textContent = "Confirm " + name;
        $("#confirmation").hidden = false;
      };
    $("#dismiss").onclick = () => {
      $("#confirmation").hidden = true;
      pendingAction = null;
    };
    $("#confirm").onclick = () => pendingAction && action(pendingAction);
    $("#correction-form").onsubmit = (event) => {
      event.preventDefault();
      action("attendance", {
        studentId: selectedStudent,
        status: $("#attendance-status").value,
        reason: $("#reason").value,
      });
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
  $("#create-start").value = inputDate(new Date());
  $("#create-end").value = inputDate(new Date(Date.now() + 3600000));
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
