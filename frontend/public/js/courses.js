import { api } from "./api.js";
import { $, escape, init, showError, notice } from "./common.js";
const user = await init(["STUDENT"]);
let state;
async function load() {
  try {
    state = await api("/student/course-setup", { method: "POST", body: {} });
    $("#course-status").textContent =
      state.message + (state.reviewNote ? " " + state.reviewNote : "");
    $("#course-confirm").hidden = state.status !== "READY";
    $("#course-placement").innerHTML = state.placement
      ? `<h2>${escape(state.placement.groupKey)}</h2><p>${escape(state.term?.academicYear || "")} · Semester ${escape(state.term?.semester || "")}</p>`
      : "";
    if (state.status !== "READY") return;
    $("#course-list").innerHTML = state.courses
      .map(
        (c) =>
          `<article class="card"><label><input type="checkbox" data-course="${escape(c.id)}" ${c.compulsory || c.enrolled ? "checked" : ""} ${c.compulsory || c.recordExists ? "disabled" : ""} /> ${escape(c.code)} · ${escape(c.title)}</label><p class="small">${c.compulsory ? "Compulsory" : "Elective"} · ${c.enrolled ? "Assigned" : c.recordExists ? "Existing assignment is outside its effective dates; contact the registrar" : "Not selected"}${c.effectiveFrom ? " · Effective from " + escape(c.effectiveFrom) : ""}</p></article>`,
      )
      .join("");
    if (state.confirmedAt)
      notice("You have confirmed this version of your course list.");
  } catch (error) {
    $("#course-status").textContent =
      "Connect to load your current course list.";
    showError(error);
  }
}
if (user) {
  $("#course-reload").onclick = () => {
    showError(null);
    load();
  };
  $("#course-confirm").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api("/student/course-setup", {
        method: "POST",
        body: {
          confirm: true,
          planId: state.planId,
          version: state.version,
          electives: [...document.querySelectorAll("[data-course]:checked")]
            .map((n) => n.dataset.course)
            .filter((id) =>
              state.courses.some((c) => c.id === id && !c.compulsory),
            ),
        },
      });
      notice("Your course list is confirmed.");
      await load();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  };
  await load();
}
