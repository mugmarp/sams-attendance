import { getCatalogue, allProgrammes, filterPanel } from "./academic-ui.js";
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
let scope = null,
  studentOptions = [],
  academicCatalogue = null;
if (user && !courseId) {
  academicCatalogue = await getCatalogue(user);
  scope = filterPanel($("#academic-filters"), academicCatalogue, () => {
    void Promise.all([loadCourses(), setupOptions()]).catch(showError);
  });
}
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
    const courses = await api("/admin/courses?" + (scope?.query() || ""));
    if ($("#scope-count"))
      $("#scope-count").textContent =
        `${courses.length} offerings in this scope${courses.length === 100 ? "; refine the filters to narrow this bounded list" : ""}.`;
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
  const [users, courses, students] = await Promise.all([
    api("/admin/users?role=EXAMINER&limit=200"),
    api("/admin/courses?" + (scope?.query() || "")),
    api("/admin/students?" + (scope?.query() || "")),
  ]);
  studentOptions = students;
  const ps = allProgrammes(academicCatalogue).filter(
    (p) =>
      !scope?.values().faculty || p.faculty.code === scope.values().faculty,
  );
  for (const target of [
    "new-program",
    "student-programme",
    "profile-programme",
  ]) {
    const old = $("#" + target).value;
    $("#" + target).innerHTML = ps
      .map(
        (p) =>
          `<option value="${escape(p.code)}">${escape(p.code)} · ${escape(p.name)}</option>`,
      )
      .join("");
    $("#" + target).value = ps.some((p) => p.code === old)
      ? old
      : ps.some((p) => p.code === "BSE")
        ? "BSE"
        : ps[0]?.code || "";
  }
  fillStudentGroups("student");
  fillCourseAudiences();
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
    students,
    (u) => u.name + " · " + u.regNo,
  );
  $("#profile-student").innerHTML = options(
    students,
    (u) => u.name + " · " + u.regNo,
  );
  $("#profile-identity").textContent =
    `${students.length} students in the selected academic scope. Use search to narrow large cohorts.`;
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
    academicCatalogue?.academicYear || calendarYear + "/" + (calendarYear + 1);
  $("#student-academic-year").defaultValue =
    academicCatalogue?.academicYear || $("#new-academic-year").defaultValue;
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
        ...(role === "STUDENT"
          ? {
              programmeCode: $("#student-programme").value,
              year: Number($("#student-year").value),
              studyGroupKey: $("#student-group").value,
              studyAcademicYear: $("#student-academic-year").value,
              studySemester: Number($("#student-semester").value),
            }
          : {}),
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
        audienceGroups: [
          ...document.querySelectorAll("#audience-options input:checked"),
        ].map((n) => n.value),
      },
      "Course offering created.",
    );
  };
  $("#new-program").onchange = fillCourseAudiences;
  $("#new-year").oninput = fillCourseAudiences;
  $("#new-role").onchange = () => {
    for (const field of [
      "new-reg",
      "student-programme",
      "student-year",
      "student-academic-year",
      "student-semester",
      "student-group",
    ])
      $("#" + field).closest("div").hidden = $("#new-role").value !== "STUDENT";
  };
  $("#student-programme").onchange = () => fillStudentGroups("student");
  $("#student-year").oninput = () => fillStudentGroups("student");
  $("#profile-programme").onchange = () => fillStudentGroups("profile");
  $("#profile-year").oninput = () => fillStudentGroups("profile");
  $("#new-reg").onchange = async () => {
    try {
      const info = await api(
        "/admin/registration/preview?" +
          new URLSearchParams({
            regNo: $("#new-reg").value,
            academicYear: $("#student-academic-year").value,
          }),
      );
      $("#registration-hint").textContent =
        `${info.programme?.faculty?.name || "Programme needs review"} · suggested Year ${info.suggestedYear || "awaiting review"}. ${info.notice}`;
      if (!$("#new-email").value) $("#new-email").value = info.emailSuggestion;
      if (info.programme) {
        $("#student-programme").value = info.programme.code;
        if (info.suggestedYear) $("#student-year").value = info.suggestedYear;
        fillStudentGroups("student");
      }
    } catch (error) {
      $("#registration-hint").textContent = error.message;
    }
  };
  $("#profile-student").onchange = () => {
    const student = studentOptions.find(
      (s) => s.id === $("#profile-student").value,
    );
    if (!student) return;
    $("#profile-identity").textContent =
      `${student.name} · ${student.regNo} · ${student.email} · intake ${student.admissionYear || "unreviewed"} · ${{ USER_SUPPLIED: "User-supplied record", SYNTHETIC: "Sample record", OPERATOR: "Registrar record" }[student.dataOrigin] || "Registrar record"}`;
    $("#profile-programme").value =
      student.programmeCode || student.program || "";
    $("#profile-year").value = student.year || "";
    fillStudentGroups("profile");
    $("#profile-group").value = student.studyGroupKey || "";
    $("#profile-academic-year").value =
      student.studyAcademicYear || "2026/2027";
    $("#profile-semester").value = student.studySemester || 1;
  };
  $("#profile-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(`/admin/students/${$("#profile-student").value}/profile`, {
        method: "PATCH",
        body: {
          programmeCode: $("#profile-programme").value,
          year: Number($("#profile-year").value),
          studyGroupKey: $("#profile-group").value,
          studyAcademicYear: $("#profile-academic-year").value,
          studySemester: Number($("#profile-semester").value),
          reason: $("#profile-reason").value,
        },
      });
      notice(
        "Academic placement confirmed. Historical enrollments are unchanged.",
      );
      await setupOptions();
    } catch (error) {
      showError(error);
    }
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
        ...($("#enroll-override").value.trim()
          ? { overrideReason: $("#enroll-override").value.trim() }
          : {}),
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

function fillStudentGroups(prefix) {
  const code = $("#" + prefix + "-programme").value,
    year = Number($("#" + prefix + "-year").value),
    select = $("#" + prefix + "-group"),
    old = select.value;
  const groups =
    allProgrammes(academicCatalogue)
      .find((p) => p.code === code)
      ?.groups.filter((g) => g.studyYear === year) || [];
  select.innerHTML =
    (groups.length !== 1
      ? '<option value="">Choose a year / track</option>'
      : "") + groups.map((g) => `<option>${escape(g.key)}</option>`).join("");
  if (groups.some((g) => g.key === old)) select.value = old;
}

function fillCourseAudiences() {
  if (!academicCatalogue) return;
  const faculty = scope?.values().faculty,
    year = Number($("#new-year").value),
    primary = $("#new-program").value;
  const selected = [
    ...document.querySelectorAll("#audience-options input:checked"),
  ].map((n) => n.value);
  const groups = allProgrammes(academicCatalogue)
    .filter((p) => !faculty || p.faculty.code === faculty)
    .flatMap((p) => p.groups)
    .filter((g) => g.studyYear === year);
  $("#audience-options").innerHTML = groups
    .map(
      (g) =>
        `<label><input style="width:auto" type="checkbox" value="${escape(g.key)}" ${selected.includes(g.key) || (g.programmeCode === primary && !g.track) ? "checked" : ""} /> ${escape(g.key)}</label>`,
    )
    .join("");
}
