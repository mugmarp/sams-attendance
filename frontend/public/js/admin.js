import { api } from "./api.js";
import {
  $,
  escape,
  init,
  showError,
  notice,
  currentDate,
  day,
} from "./common.js";
const lecturer = location.pathname.startsWith("/examiner/report/");
const user = await init(lecturer ? ["EXAMINER", "ADMIN"] : ["ADMIN"]);
const courseId =
  lecturer || location.pathname.includes("/eligibility/")
    ? location.pathname.split("/").pop()
    : null;
let report = null;
const reportPath = lecturer
  ? "/examiner/courses/" + courseId + "/attendance-summary"
  : "/admin/eligibility/" + courseId;
if (lecturer) {
  const back = document.querySelector("#report-view > a");
  back.href = "/examiner/dashboard";
  back.textContent = "← Classes";
}
function renderReport() {
  const students = report.students,
    threshold = report.course.attendanceThreshold || 80,
    filter = $("#filter").value;
  const visible = students.filter(
    (s) =>
      filter === "all" ||
      (filter === "met"
        ? s.eligible
        : filter === "below"
          ? s.attendancePct !== null && !s.eligible
          : s.attendancePct === null),
  );
  $("#course-title").textContent =
    `${report.course.code} · ${report.course.title} · ${report.course.academicYear}, Semester ${report.course.semester}`;
  $("#stats").innerHTML = [
    ["Enrollment records", students.length],
    ["Attendance requirement met", students.filter((s) => s.eligible).length],
    ["Not assessed", students.filter((s) => s.attendancePct === null).length],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><p class="muted small">${label}</p><p class="stat">${value}</p></div>`,
    )
    .join("");
  $("#report-rows").innerHTML = visible
    .map(
      (s) =>
        `<tr><td><strong>${escape(s.name)}</strong><br><span class="small">${escape(s.regNo)}</span></td><td>${s.presentCount}</td><td>${s.totalSessions}</td><td>${s.attendancePct === null ? "—" : s.attendancePct.toFixed(1) + "%"}</td><td>${s.attendancePct === null ? "Not assessed" : s.eligible ? "Met" : "Below " + threshold + "%"}</td></tr>`,
    )
    .join("");
  $("#empty-report").hidden = visible.length > 0;
  $("#report-rules").textContent = report.rules;
  $("#report-context").textContent =
    `Live report · policy v${report.course.policyVersion} · ${report.pendingClaims || 0} pending review requests. Each student's denominator follows recorded enrollment dates.`;
  if (user.role === "ADMIN") {
    $("#policy-controls").hidden = false;
    $("#enrollment-controls").hidden = false;
    if (!$("#policy-form").contains(document.activeElement)) {
      $("#policy-threshold").value = report.course.attendanceThreshold;
      $("#policy-late").checked = report.course.countLate;
      $("#policy-excused").checked = report.course.countExcused;
    }
    const selected = $("#dated-enrollment").value;
    $("#dated-enrollment").innerHTML =
      '<option value="">Choose an enrollment</option>' +
      students
        .map(
          (s) =>
            `<option value="${s.enrollmentId}">${escape(s.name)} · ${escape(s.regNo)}${s.effectiveUntil ? " · withdrawal recorded" : ""}</option>`,
        )
        .join("");
    if (students.some((s) => s.enrollmentId === selected))
      $("#dated-enrollment").value = selected;
  }
}
async function loadReport() {
  try {
    report = await api(reportPath);
    renderReport();
    showError(null);
  } catch (error) {
    showError(error);
  }
}
async function loadCourses() {
  try {
    const courses = await api("/admin/courses");
    $("#courses").innerHTML = courses.length
      ? courses
          .map(
            (c) =>
              `<a class="card course" href="/admin/eligibility/${c.id}"><span class="code">${escape(c.code)}</span><h2>${escape(c.title)}</h2><p class="small muted">${escape(c.academicYear)} · Semester ${c.semester} · ${escape(c.program)}</p><p class="small">${escape(c.examiner?.name)} · ${c._count?.enrollments || 0} enrolled students</p><p>View attendance report →</p></a>`,
          )
          .join("")
      : '<div class="card">No courses yet. Create a course below.</div>';
    showError(null);
  } catch (error) {
    showError(error);
  }
}
if (user) {
  if (courseId) {
    $("#report-view").hidden = false;
    await loadReport();
    setInterval(loadReport, 15000);
    $("#filter").onchange = () => report && renderReport();
    await loadSnapshots();
    $("#snapshot-form").onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api(`/reports/courses/${courseId}/snapshots`, {
          method: "POST",
          body: {
            reason: $("#snapshot-reason").value,
            reviewedPendingWork: true,
            basePolicyVersion: report.course.policyVersion,
          },
        });
        notice("Report snapshot saved with its current policy and counts.");
        await loadSnapshots();
      } catch (error) {
        showError(error);
      }
    };
    if (user.role === "ADMIN") {
      $("#policy-form").onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api(`/admin/courses/${courseId}/policy`, {
            method: "PATCH",
            body: {
              attendanceThreshold: Number($("#policy-threshold").value),
              countLate: $("#policy-late").checked,
              countExcused: $("#policy-excused").checked,
              basePolicyVersion: report.course.policyVersion,
              reason: $("#policy-reason").value,
            },
          });
          notice(
            "Configured policy updated; existing snapshots are unchanged.",
          );
          await loadReport();
        } catch (error) {
          showError(error);
        }
      };
      $("#dated-enrollment").onchange = () => {
        const row = report.students.find(
          (s) => s.enrollmentId === $("#dated-enrollment").value,
        );
        $("#effective-from").value = row?.effectiveFrom?.slice(0, 10) || "";
        $("#effective-until").value = row?.effectiveUntil?.slice(0, 10) || "";
      };
      $("#enrollment-dates-form").onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api(`/admin/enrollments/${$("#dated-enrollment").value}`, {
            method: "PATCH",
            body: {
              effectiveFrom: $("#effective-from").value || null,
              effectiveUntil: $("#effective-until").value || null,
              reason: $("#enrollment-reason").value,
            },
          });
          notice("Enrollment dates saved; historical attendance was retained.");
          await loadReport();
        } catch (error) {
          showError(error);
        }
      };
    }
    $("#download").onclick = async () => {
      const button = $("#download");
      button.disabled = true;
      try {
        const blob = await api(reportPath + "/pdf");
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = (report?.course.code || "course") + "-attendance.pdf";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        showError(error);
      } finally {
        button.disabled = false;
      }
    };
  } else {
    $("#course-view").hidden = false;
    await loadCourses();
  }
}

async function setupOptions() {
  const [users, courses] = await Promise.all([
    api("/admin/users"),
    api("/admin/courses"),
  ]);
  const options = (items, label) =>
    '<option value="">Choose…</option>' +
    items
      .map(
        (item) => `<option value="${item.id}">${escape(label(item))}</option>`,
      )
      .join("");
  $("#new-examiner").innerHTML = options(
    users.filter((u) => u.role === "EXAMINER"),
    (u) => u.name + " (" + u.email + ")",
  );
  $("#enroll-student").innerHTML = options(
    users.filter((u) => u.role === "STUDENT"),
    (u) => u.name + " · " + u.regNo,
  );
  $("#enroll-course").innerHTML = options(
    courses,
    (c) => c.code + " · " + c.academicYear + " / " + c.semester,
  );
}
async function saveSetup(form, path, body, text) {
  const button = form.querySelector("button");
  button.disabled = true;
  showError(null);
  notice("");
  try {
    await api(path, { method: "POST", body });
    form.reset();
    if (form.id === "enrollment-form") $("#enroll-from").value = day();
    notice(text);
    await Promise.all([loadCourses(), setupOptions()]);
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}
if (user && !courseId) {
  const calendarYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Kampala",
      year: "numeric",
    }).format(currentDate()),
  );
  $("#new-academic-year").defaultValue =
    calendarYear + "/" + (calendarYear + 1);
  await setupOptions().catch(showError);
  $("#user-form").onsubmit = (event) => {
    event.preventDefault();
    const role = $("#new-role").value,
      regNo = $("#new-reg").value.trim();
    saveSetup(
      event.currentTarget,
      "/admin/users",
      {
        email: $("#new-email").value,
        name: $("#new-name").value,
        role,
        password: $("#new-password").value,
        ...(regNo ? { regNo } : {}),
      },
      "Account created. Share its initial password privately.",
    );
  };
  $("#course-form").onsubmit = (event) => {
    event.preventDefault();
    saveSetup(
      event.currentTarget,
      "/admin/courses",
      {
        code: $("#new-code").value,
        title: $("#new-title").value,
        program: $("#new-program").value,
        year: Number($("#new-year").value),
        academicYear: $("#new-academic-year").value,
        semester: Number($("#new-semester").value),
        examinerId: $("#new-examiner").value,
        attendanceThreshold: Number($("#new-threshold").value),
      },
      "Course offering created.",
    );
  };
  $("#enroll-from").value = day();
  $("#enrollment-form").onsubmit = (event) => {
    event.preventDefault();
    saveSetup(
      event.currentTarget,
      "/admin/courses/" + $("#enroll-course").value + "/enroll",
      {
        studentId: $("#enroll-student").value,
        effectiveFrom: $("#enroll-from").value,
      },
      "Student enrolled in the course.",
    );
  };
}

async function loadSnapshots() {
  const list = await api(`/reports/courses/${courseId}/snapshots`);
  $("#report-snapshots").innerHTML = list.length
    ? list
        .map(
          (s) =>
            `<p><strong>${escape(new Date(s.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Kampala" }))}</strong> · ${escape(s.reason)} <button data-snapshot="${s.id}">Download saved PDF</button></p>`,
        )
        .join("")
    : "<p>No saved report snapshots.</p>";
  for (const button of $("#report-snapshots").querySelectorAll(
    "[data-snapshot]",
  ))
    button.onclick = async () => {
      try {
        const blob = await api(
          `/reports/snapshots/${button.dataset.snapshot}/pdf`,
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `attendance-snapshot-${button.dataset.snapshot}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        showError(error);
      }
    };
}
