import { api } from "./api.js";
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
import { studentData as cachedGet } from "./offline.js";
const setup = location.pathname === "/admin/timetable";
const user = await init(setup ? ["ADMIN"] : ["STUDENT", "EXAMINER", "ADMIN"]);
let reference = null,
  calendar = null,
  rows = [],
  courses = [],
  entries = [],
  preview = null,
  selectedPublication = "";
const ymd = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const civil = (value) => value?.slice(0, 10);
const addDays = (value, n) =>
  new Date(Date.parse(value + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
function renderCalendar() {
  const ref = calendar.reference;
  const today = day();
  const week =
    Math.floor(
      (Date.parse(today) - Date.parse(ref.lecturesBegin)) / 604800000,
    ) + 1;
  $("#calendar-summary").textContent =
    `${ref.academicYear} · Semester ${ref.semester} · lectures begin ${ref.lecturesBegin} · semester ends ${ref.semesterEnds}${today >= ref.lecturesBegin && today <= ref.semesterEnds ? ` · calendar week ${week}` : ""}`;
  $("#calendar-events").textContent =
    ref.events.map((e) => `${e.title}: ${e.date}`).join(" · ") +
    ". Calendar-week numbering is not a verified faculty teaching-week count. Reference dates require registrar review.";
}
async function loadDated() {
  try {
    const date = $("#schedule-date").value;
    const result = await cachedGet(
      user.id,
      `/timetable/sessions?from=${date}&to=${date}`,
    );
    $("#live-status").textContent = result.cached
      ? "Showing saved dated classes; server confirmation is unavailable."
      : "Live SAMS classes · refreshes every 15 seconds while this page is visible.";
    $("#dated-classes").innerHTML = result.data.length
      ? result.data
          .map((s) => {
            const now = currentDate().getTime();
            const state =
              s.status === "COMPLETED"
                ? "Completed"
                : s.status === "CANCELLED"
                  ? "Cancelled"
                  : now < Date.parse(s.startTime)
                    ? "Upcoming"
                    : now < Date.parse(s.endTime)
                      ? "In progress"
                      : "Ended · awaiting lecturer completion";
            return `<article class="card"><span class="badge">${escape(state)}</span><h3>${escape(s.courseCode)} · ${escape(s.courseTitle)}</h3><p>${time(s.startTime)} – ${time(s.endTime)} · ${escape(s.room || "Venue unspecified")}</p><p class="small">${s.timetableEntryId ? "From a reviewed timetable rule" : "Individually created class"}</p><a href="${user.role === "STUDENT" ? (s.status === "SCHEDULED" ? "/student/checkin?sessionId=" + s.id : "/student/summary") : "/examiner/session/" + s.id}">${user.role === "STUDENT" ? (s.status === "SCHEDULED" ? "Open check-in" : "View my attendance") : "Open register"}</a></article>`;
          })
          .join("")
      : "<p>No dated classes for this account on the selected day. Weekly patterns below are reference data, not held classes.</p>";
  } catch (error) {
    showError(error);
  }
}
async function loadReference() {
  try {
    const params = new URLSearchParams();
    if ($("#program-group").value)
      params.set("group", $("#program-group").value);
    if ($("#reference-course").value.trim())
      params.set("course", $("#reference-course").value.trim().toUpperCase());
    if (selectedPublication) params.set("publicationId", selectedPublication);
    const result = await cachedGet(user.id, "/timetable/reference?" + params);
    reference = result.data;
    rows = reference.rows;
    const selected = $("#program-group").value;
    $("#program-group").innerHTML =
      '<option value="">All groups</option>' +
      reference.groups.map((g) => `<option>${escape(g)}</option>`).join("");
    $("#program-group").value = selected;
    const p = reference.publication;
    $("#source-status").textContent =
      `${result.cached ? "Saved reference · " : ""}${p.source} · ${p.metadata.version_label || "Source timetable"} · checked ${time(p.checkedAt)} · ${reference.matched} matches${reference.matched > rows.length ? "; showing first 200, filter by group/course" : ""}. Source metadata: ${p.metadata.academic_year || "unspecified year"}; reported update ${p.metadata.last_updated ? new Date(p.metadata.last_updated).toISOString().slice(0, 10) : "unspecified"}.`;
    $("#weekly-classes").innerHTML =
      reference.days
        .map((name, i) => {
          const list = rows.filter((r) => r.weekday === i + 1);
          return list.length
            ? `<section class="card"><h3>${name}</h3>${list.map((r) => `<div class="queue-item"><strong>${escape(r.course_code)} · ${escape(r.course_title)}</strong><p>${escape(r.start_time)} – ${escape(r.end_time || "unspecified")} · ${escape(r.room || "Venue unspecified")}</p><p class="small">${escape(r.program_group)} · ${escape(r.lecturer || "Lecturer unspecified")}</p>${r.issues.includes("TIME_FIELDS_DISAGREE") ? `<p class="small">Review needed: source grid slot ${escape(r.time_slot)} differs from the class interval.</p>` : ""}</div>`).join("")}</section>`
            : "";
        })
        .join("") || "<p>No matching reference entries.</p>";
    if (user.role === "ADMIN" && setup) {
      $("#source-entry").innerHTML =
        '<option value="">Choose a source row</option>' +
        rows
          .map(
            (r, index) =>
              `<option value="${index}">${escape(r.program_group)} · ${escape(r.course_code)} · ${escape(r.day)} ${escape(r.start_time)}</option>`,
          )
          .join("");
    }
    showError(null);
  } catch (error) {
    showError(error);
  }
}
function fillTerm(term) {
  const ref = calendar.reference;
  $("#term-year").value = term?.academicYear || ref.academicYear;
  $("#term-semester").value = term?.semester || ref.semester;
  $("#term-start").value = civil(term?.startsOn) || ref.lecturesBegin;
  $("#term-end").value = civil(term?.endsOn) || ref.semesterEnds;
  $("#excluded-dates").value = (term?.excludedDates || [])
    .map((e) => e.date + " | " + e.reason)
    .join("\n");
  $("#calendar-source").value = term?.sourceUrl || ref.sources[0];
  $("#calendar-reason").value = "";
  $("#calendar-reviewed").checked = false;
}
function fillEntries() {
  const matching = entries.filter(
    (e) =>
      e.courseId === $("#mapped-course").value &&
      e.termId === $("#mapped-term").value,
  );
  $("#mapped-entry").innerHTML =
    '<option value="">Create new rule</option>' +
    matching
      .map(
        (e) =>
          `<option value="${e.id}">${escape(e.course.code)} · ${reference.days[e.weekday - 1]} · rule v${e.version}</option>`,
      )
      .join("");
  const row = rows[Number($("#source-entry").value)];
  const same = matching.find((e) => e.sourceKey === row?.natural_key);
  if (same) $("#mapped-entry").value = same.id;
}
async function loadAdmin() {
  const [publications, offerings, linked] = await Promise.all([
    api("/admin/timetable/publications"),
    api("/admin/courses"),
    api("/admin/timetable/entries"),
  ]);
  courses = offerings;
  entries = linked;
  $("#publication").innerHTML = publications.publications
    .map(
      (p) =>
        `<option value="${p.id}">${escape(p.source)} · ${p.contentHash.slice(0, 8)} · ${time(p.checkedAt)}</option>`,
    )
    .join("");
  if (selectedPublication) $("#publication").value = selectedPublication;
  else {
    selectedPublication = $("#publication").value;
  }
  $("#source-checks").textContent = publications.checks[0]
    ? `${publications.checks[0].kind}: ${publications.checks[0].reason || ""}`
    : "No repository checks yet. Bundled reference data is available.";
  $("#mapped-course").innerHTML =
    '<option value="">Choose an existing offering</option>' +
    courses
      .map(
        (c) =>
          `<option value="${c.id}">${escape(c.code)} · ${escape(c.title)} · ${escape(c.academicYear)} S${c.semester} · ${escape(c.examiner?.name)}</option>`,
      )
      .join("");
  const terms = calendar.terms;
  $("#existing-term").innerHTML =
    '<option value="">Create from reference dates</option>' +
    terms
      .map(
        (t) =>
          `<option value="${t.id}">${escape(t.academicYear)} · Semester ${t.semester} · v${t.version}</option>`,
      )
      .join("");
  $("#mapped-term").innerHTML =
    '<option value="">Choose a reviewed term</option>' +
    terms
      .map(
        (t) =>
          `<option value="${t.id}">${escape(t.academicYear)} · Semester ${t.semester}</option>`,
      )
      .join("");
  if (terms.length) $("#mapped-term").value = terms[0].id;
  fillTerm(null);
  fillEntries();
}
if (user) {
  $("#schedule-date").value = day();
  $("#schedule-date").onchange = loadDated;
  $("#filter-reference").onclick = loadReference;
  $("#program-group").onchange = loadReference;
  try {
    calendar = (await cachedGet(user.id, "/timetable/calendar")).data;
    renderCalendar();
  } catch (error) {
    showError(error);
  }
  await loadReference();
  if (user.program && user.year) {
    const roman = ["", "I", "II", "III", "IV", "V", "VI"][user.year];
    const group = reference?.groups.find(
      (g) => g === `${user.program} ${roman}`,
    );
    if (group) {
      $("#program-group").value = group;
      await loadReference();
    }
  }
  await loadDated();
  setInterval(() => {
    if (!document.hidden) void loadDated();
  }, 15000);
  addEventListener("online", loadDated);
  addEventListener("focus", loadDated);
  if (user.role === "ADMIN" && setup) {
    $("#timetable-admin").hidden = false;
    await loadAdmin();
    $("#mapped-day").innerHTML = reference.days
      .map((name, i) => `<option value="${i + 1}">${name}</option>`)
      .join("");
    $("#generate-from").value = day();
    $("#generate-to").value = addDays(day(), 6);
    $("#existing-term").onchange = () =>
      fillTerm(calendar.terms.find((t) => t.id === $("#existing-term").value));
    $("#mapped-course").onchange = fillEntries;
    $("#mapped-term").onchange = fillEntries;
    $("#publication").onchange = async () => {
      selectedPublication = $("#publication").value;
      await loadReference();
    };
    $("#source-entry").onchange = () => {
      const row = rows[Number($("#source-entry").value)];
      if (!row) return;
      $("#row-details").textContent =
        `${row.natural_key}. Source interval ${row.start_time}–${row.end_time}; grid ${row.time_slot}. ${row.issues.join(", ")}`;
      $("#mapped-day").value = row.weekday || "";
      $("#mapped-start").value =
        row.startMinute === null
          ? ""
          : String(Math.floor(row.startMinute / 60)).padStart(2, "0") +
            ":" +
            String(row.startMinute % 60).padStart(2, "0");
      $("#mapped-end").value =
        row.issues.includes("TIME_FIELDS_DISAGREE") || row.endMinute === null
          ? ""
          : String(Math.floor(row.endMinute / 60)).padStart(2, "0") +
            ":" +
            String(row.endMinute % 60).padStart(2, "0");
      $("#mapped-room").value = row.room || "";
      $("#mapped-type").value = String(row.session_type || "").toUpperCase();
      const term = calendar.terms.find((t) => t.id === $("#mapped-term").value);
      const course = courses.find(
        (c) =>
          c.code === row.course_code &&
          (!term ||
            (c.academicYear === term.academicYear &&
              c.semester === term.semester)),
      );
      $("#mapped-course").value = course?.id || "";
      fillEntries();
      $("#mapping-reviewed").checked = false;
    };
    $("#check-source").onclick = async () => {
      const button = $("#check-source");
      button.disabled = true;
      try {
        const result = await api("/admin/timetable/refresh", {
          method: "POST",
          body: { source: $("#repository-source").value },
        });
        notice(
          result.message ||
            "Source checked. Review changes before applying them.",
        );
        selectedPublication = result.publicationId || selectedPublication;
        await loadAdmin();
        await loadReference();
      } catch (error) {
        showError(error);
      } finally {
        button.disabled = false;
      }
    };
    $("#term-form").onsubmit = async (event) => {
      event.preventDefault();
      try {
        const prior = calendar.terms.find(
          (t) => t.id === $("#existing-term").value,
        );
        const excludedDates = $("#excluded-dates")
          .value.split("\n")
          .filter((line) => line.trim())
          .map((line) => {
            const split = line.indexOf("|");
            return {
              date: line.slice(0, split).trim(),
              reason: line.slice(split + 1).trim(),
            };
          });
        await api("/admin/timetable/terms", {
          method: "POST",
          body: {
            academicYear: $("#term-year").value,
            semester: Number($("#term-semester").value),
            startsOn: $("#term-start").value,
            endsOn: $("#term-end").value,
            excludedDates,
            sourceUrl: $("#calendar-source").value,
            sourceNote: $("#calendar-reason").value,
            reviewed: true,
            ...(prior ? { baseVersion: prior.version } : {}),
          },
        });
        calendar = await api("/timetable/calendar");
        await loadAdmin();
        notice("Reviewed academic calendar saved.");
      } catch (error) {
        showError(error);
      }
    };
    $("#preview-form").onsubmit = async (event) => {
      event.preventDefault();
      try {
        const row = rows[Number($("#source-entry").value)];
        preview = await api("/admin/timetable/preview", {
          method: "POST",
          body: {
            publicationId: selectedPublication || reference.publication.id,
            sourceKey: row.natural_key,
            courseId: $("#mapped-course").value,
            termId: $("#mapped-term").value,
            ...($("#mapped-entry").value
              ? { entryId: $("#mapped-entry").value }
              : {}),
            weekday: Number($("#mapped-day").value),
            startTime: $("#mapped-start").value,
            endTime: $("#mapped-end").value,
            room: $("#mapped-room").value,
            sessionType: $("#mapped-type").value,
            from: $("#generate-from").value,
            to: $("#generate-to").value,
            reviewed: true,
            reason: $("#mapping-reason").value,
          },
        });
        $("#preview-result").innerHTML =
          `<h3>Review preview</h3><p>${Object.entries(preview.summary)
            .map(([key, n]) => escape(key.toLowerCase()) + ": " + n)
            .join(
              " · ",
            )}</p>${preview.blockers.map((message) => `<p class="alert">${escape(message)}</p>`).join("")}${preview.warnings.map((message) => `<p>${escape(message)}</p>`).join("")}<ul>${preview.items.map((item) => `<li>${escape(item.action)} · ${escape(item.date)} ${item.startTime ? time(item.startTime) + " – " + time(item.endTime) : escape(item.message || "")}</li>`).join("")}</ul>`;
        $("#apply-preview").hidden = false;
        $("#apply-preview").disabled = !!preview.blockers.length;
      } catch (error) {
        showError(error);
      }
    };
    $("#apply-preview").onclick = async () => {
      try {
        const result = await api(
          `/admin/timetable/reviews/${preview.id}/apply`,
          { method: "POST" },
        );
        notice(
          result.replayed
            ? "This review was already applied."
            : "Reviewed classes applied. Existing attendance was preserved.",
        );
        $("#apply-preview").hidden = true;
        await loadAdmin();
        await loadDated();
      } catch (error) {
        showError(error);
      }
    };
  }
}
