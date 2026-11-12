import { $, escape } from "./common.js";
import { studentData } from "./offline.js";
export async function getCatalogue(user) {
  return (await studentData(user.id, "/academic/catalog")).data;
}
export function allProgrammes(catalogue) {
  return catalogue.faculties.flatMap((f) =>
    f.programmes.map((p) => ({ ...p, faculty: f })),
  );
}
export function filterPanel(node, catalogue, onChange) {
  node.innerHTML = `<div class="grid academic-filter-fields"><div><label for="scope-faculty">Faculty</label><select id="scope-faculty"><option value="">All faculties</option>${catalogue.faculties.map((f) => `<option value="${escape(f.code)}">${escape(f.name)}</option>`).join("")}</select></div><div><label for="scope-programme">Programme</label><select id="scope-programme"></select></div><div><label for="scope-year">Study year</label><select id="scope-year"><option value="">All years</option>${[1, 2, 3, 4, 5].map((y) => `<option>${y}</option>`).join("")}</select></div><div><label for="scope-group">Timetable group / track</label><select id="scope-group"></select></div><div><label for="scope-academic-year">Academic year filter</label><input id="scope-academic-year" placeholder="YYYY/YYYY" pattern="[0-9]{4}/[0-9]{4}" /></div><div><label for="scope-semester">Semester filter</label><select id="scope-semester"><option value="">All semesters</option><option>1</option><option>2</option></select></div><div><label for="scope-search">Search courses or students</label><input id="scope-search" type="search" maxlength="100" placeholder="Code, title, name or registration" /></div></div>`;
  const values = () =>
    Object.fromEntries(
      [
        "faculty",
        "programme",
        "year",
        "group",
        "academic-year",
        "semester",
        "search",
      ]
        .map((k) => [
          k === "academic-year" ? "academicYear" : k,
          $("#scope-" + k).value.trim(),
        ])
        .filter(([, v]) => v),
    );
  const fill = () => {
    const programme = $("#scope-programme").value,
      group = $("#scope-group").value,
      faculty = $("#scope-faculty").value;
    const ps = allProgrammes(catalogue).filter(
      (p) => !faculty || p.faculty.code === faculty,
    );
    $("#scope-programme").innerHTML =
      '<option value="">All programmes in faculty</option>' +
      ps
        .map(
          (p) =>
            `<option value="${escape(p.code)}">${escape(p.code)} · ${escape(p.name)}</option>`,
        )
        .join("");
    if (ps.some((p) => p.code === programme))
      $("#scope-programme").value = programme;
    const selected = ps.find((p) => p.code === $("#scope-programme").value),
      groups = (selected?.groups || []).filter(
        (g) =>
          !$("#scope-year").value ||
          g.studyYear === Number($("#scope-year").value),
      );
    $("#scope-group").innerHTML =
      '<option value="">All groups</option>' +
      groups.map((g) => `<option>${escape(g.key)}</option>`).join("");
    if (groups.some((g) => g.key === group)) $("#scope-group").value = group;
    $("#scope-group").disabled = !selected;
  };
  // A manageable initial scope; an explicit All faculties selection remains available.
  $("#scope-faculty").value = catalogue.faculties.some(
    (f) => f.code === "computing",
  )
    ? "computing"
    : "";
  fill();
  for (const key of [
    "faculty",
    "programme",
    "year",
    "group",
    "academic-year",
    "semester",
  ])
    $("#scope-" + key).onchange = () => {
      if (["faculty", "programme", "year"].includes(key)) fill();
      onChange(values());
    };
  let timer;
  $("#scope-search").oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(values()), 250);
  };
  return { values, query: () => new URLSearchParams(values()).toString() };
}
