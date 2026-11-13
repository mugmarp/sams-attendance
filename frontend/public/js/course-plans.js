import { api } from "./api.js";
import { $, escape, init, showError, notice } from "./common.js";
import { getCatalogue, allProgrammes } from "./academic-ui.js";
const user = await init(["ADMIN"]);
let catalog,
  options,
  sourceRows = [],
  scopeGeneration = 0;
const scope = () => ({
  termId: $("#plan-term").value,
  groupKey: $("#plan-group").value,
});
const reason = () => $("#plan-reason").value.trim();
const option = (value, label) =>
  `<option value="${escape(value)}">${escape(label)}</option>`;
function clearPreviews() {
  for (const id of ["source-review", "plan-review", "batch-review"])
    $("#" + id).replaceChildren();
}
function resetScope() {
  scopeGeneration++;
  clearPreviews();
  sourceRows = [];
  $("#source-courses").replaceChildren();
  $("#source-preview").hidden = true;
}
async function attempt(fn) {
  showError(null);
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}
function mutationReview(target, label, input, preview, endpoint, after) {
  const node = $("#" + target),
    generation = scopeGeneration;
  node.innerHTML = `<pre>${escape(JSON.stringify(preview, null, 2))}</pre><button class="primary" type="button">${escape(label)}</button>`;
  node.querySelector("button").onclick = () =>
    attempt(async () => {
      if (generation !== scopeGeneration)
        throw Error("The academic scope changed. Preview again.");
      const button = node.querySelector("button");
      button.disabled = true;
      try {
        const data = await api(endpoint, {
          method: "POST",
          body: {
            ...input,
            previewHash: preview.previewHash,
            currentPassword: $("#registrar-password").value,
            reason: reason(),
          },
        });
        $("#registrar-password").value = "";
        clearPreviews();
        notice(
          "Saved successfully. " +
            (data.students !== undefined
              ? `${data.students} students; ${data.inserted} new enrollments.`
              : ""),
        );
        await after?.();
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
}
async function loadPlan() {
  resetScope();
  const generation = scopeGeneration;
  const value = await api(
    "/admin/course-plans/options?" + new URLSearchParams(scope()),
  );
  if (generation !== scopeGeneration) return;
  options = value;
  $("#plan-note").value = value.plan?.reviewNote || "";
  $("#plan-version").textContent = value.plan
    ? `Published version ${value.plan.version}. Republishing requires students to confirm the new list.`
    : "No published course list for this scope.";
  $("#plan-courses").innerHTML = value.courses.length
    ? value.courses
        .map((c) => {
          const item = value.plan?.items.find((i) => i.courseId === c.id);
          return `<article class="card"><label><input type="checkbox" data-plan-course="${escape(c.id)}" ${item ? "checked" : ""} /> ${escape(c.code)} · ${escape(c.title)}</label><label>Course type <select data-course-type="${escape(c.id)}"><option value="required">Compulsory</option><option value="elective" ${item && !item.compulsory ? "selected" : ""}>Elective</option></select></label></article>`;
        })
        .join("")
    : "<p>No eligible offerings yet. Prepare them from the timetable above, or create them in Course reports.</p>";
  $("#plan-courses").onchange = clearPreviews;
}
function fillProgrammes() {
  const ps = allProgrammes(catalog).filter(
    (p) => p.faculty.code === $("#plan-faculty").value,
  );
  $("#plan-programme").innerHTML = ps
    .map((p) => option(p.code, p.name))
    .join("");
  fillGroups();
}
function fillGroups() {
  const p = allProgrammes(catalog).find(
    (p) => p.code === $("#plan-programme").value,
  );
  $("#plan-group").innerHTML = (p?.groups || [])
    .map((g) => option(g.key, g.key))
    .join("");
}
if (user)
  await attempt(async () => {
    catalog = await getCatalogue(user);
    options = await api("/admin/course-plans/options");
    $("#plan-term").innerHTML = options.terms
      .map((t) =>
        option(
          t.id,
          `${t.academicYear} · Semester ${t.semester} (${t.startsOn.slice(0, 10)} – ${t.endsOn.slice(0, 10)})`,
        ),
      )
      .join("");
    $("#plan-faculty").innerHTML = catalog.faculties
      .map((f) => option(f.code, f.name))
      .join("");
    if (catalog.faculties.some((f) => f.code === "computing"))
      $("#plan-faculty").value = "computing";
    fillProgrammes();
    $("#plan-faculty").onchange = () => {
      fillProgrammes();
      attempt(loadPlan);
    };
    $("#plan-programme").onchange = () => {
      fillGroups();
      attempt(loadPlan);
    };
    for (const id of ["plan-term", "plan-group"])
      $("#" + id).onchange = () => attempt(loadPlan);
    $("#plan-reason").oninput = clearPreviews;
    $("#plan-note").oninput = clearPreviews;
    $("#source-load").onclick = () =>
      attempt(async () => {
        clearPreviews();
        const generation = scopeGeneration;
        const result = await api("/admin/course-plans/source", {
          method: "POST",
          body: scope(),
        });
        if (generation !== scopeGeneration) return;
        sourceRows = result.candidates;
        $("#source-courses").innerHTML = sourceRows
          .map(
            (c) =>
              `<article class="card"><label><input type="checkbox" data-source-course="${escape(c.code)}" ${c.blocked ? "disabled" : ""} /> ${escape(c.code)} · ${escape(c.title)}</label><p class="small">${c.blocked ? "Excluded activity or invalid label" : escape(c.rows) + " weekly entries"} · Source lecturer: ${escape(c.sourceLecturers.join(", "))}</p><p class="small">${escape(c.issues.join(", "))}</p>${c.blocked ? "" : `<label>Assigned lecturer <select data-source-lecturer="${escape(c.code)}"><option value="">Choose an account</option>${options.lecturers.map((t) => option(t.id, t.name)).join("")}</select></label>`}</article>`,
          )
          .join("");
        $("#source-courses").onchange = clearPreviews;
        $("#source-preview").hidden = !sourceRows.some((c) => !c.blocked);
      });
    $("#source-preview").onclick = () =>
      attempt(async () => {
        const input = {
          ...scope(),
          reason: reason(),
          items: [
            ...document.querySelectorAll("[data-source-course]:checked"),
          ].map((n) => ({
            code: n.dataset.sourceCourse,
            examinerId: [
              ...document.querySelectorAll("[data-source-lecturer]"),
            ].find((s) => s.dataset.sourceLecturer === n.dataset.sourceCourse)
              .value,
          })),
        };
        const generation = scopeGeneration,
          preview = await api("/admin/course-plans/import-preview", {
            method: "POST",
            body: input,
          });
        if (generation === scopeGeneration)
          mutationReview(
            "source-review",
            "Create reviewed offerings",
            input,
            preview,
            "/admin/course-plans/import",
            loadPlan,
          );
      });
    $("#plan-preview").onclick = () =>
      attempt(async () => {
        const input = {
          ...scope(),
          expectedVersion: options.plan?.version || 0,
          reviewNote: $("#plan-note").value.trim(),
          reason: reason(),
          items: [
            ...document.querySelectorAll("[data-plan-course]:checked"),
          ].map((n) => ({
            courseId: n.dataset.planCourse,
            compulsory:
              [...document.querySelectorAll("[data-course-type]")].find(
                (s) => s.dataset.courseType === n.dataset.planCourse,
              ).value === "required",
          })),
        };
        const generation = scopeGeneration,
          preview = await api("/admin/course-plans/preview", {
            method: "POST",
            body: input,
          });
        if (generation === scopeGeneration)
          mutationReview(
            "plan-review",
            "Publish reviewed course list",
            input,
            preview,
            "/admin/course-plans/publish",
            loadPlan,
          );
      });
    $("#batch-preview").onclick = () =>
      attempt(async () => {
        if (!options.plan)
          throw Error("Publish this group’s course list first.");
        const input = { planId: options.plan.id },
          generation = scopeGeneration,
          preview = await api("/admin/course-plans/batch-preview", {
            method: "POST",
            body: input,
          });
        if (generation === scopeGeneration)
          mutationReview(
            "batch-review",
            "Assign courses to these students",
            input,
            preview,
            "/admin/course-plans/batch-apply",
            loadPlan,
          );
      });
    if (options.terms.length) await loadPlan();
    else
      notice(
        "Configure a reviewed term in Timetable setup before preparing courses.",
      );
  });
