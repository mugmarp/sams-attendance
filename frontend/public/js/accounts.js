import { api } from "./api.js";
import { $, escape, init, showError, notice } from "./common.js";
import { filterPanel, getCatalogue } from "./academic-ui.js";
const user = await init(["ADMIN"]);
if (user) {
  let rows = [],
    offset = 0,
    generation = 0;
  const scope = filterPanel(
    $("#account-scope"),
    await getCatalogue(user),
    () => {
      offset = 0;
      void load();
    },
  );
  const selected = () =>
    rows.find((row) => row.id === $("#target-account").value);
  function target() {
    const row = selected();
    $("#target-detail").textContent = row
      ? `${row.name} · ${row.regNo || row.email} · ${row.isActive ? "Active" : "Disabled"}${row.mustChangePassword ? " · Password change required" : ""}`
      : "";
    $("#action-card").hidden = !row || row.role === "ADMIN";
    $("#registrar-note").hidden = row?.role !== "ADMIN";
  }
  async function load() {
    const current = ++generation;
    const previousSelection = $("#target-account").value;
    $("#action-card").hidden = true;
    $("#target-account").disabled = true;
    try {
      const q = new URLSearchParams(scope.query());
      q.set("role", $("#account-role").value);
      q.set("limit", "50");
      q.set("offset", String(offset));
      if ($("#account-active").value)
        q.set("active", $("#account-active").value);
      const data = await api("/admin/accounts?" + q);
      if (current !== generation) return;
      rows = data;
      $("#target-account").innerHTML =
        '<option value="">Choose an account</option>' +
        rows
          .map(
            (r) =>
              `<option value="${r.id}">${escape(r.name)} · ${escape(r.regNo || r.email)} · ${r.isActive ? "Active" : "Disabled"}</option>`,
          )
          .join("");
      if (rows.some(row => row.id === previousSelection)) $("#target-account").value = previousSelection;
      $("#account-count").textContent = rows.length
        ? `Accounts ${offset + 1}–${offset + rows.length}. Refine the filters or search to find a person.`
        : "No accounts in this scope.";
      $("#previous").disabled = offset === 0;
      $("#next").disabled = rows.length < 50;
      target();
      showError(null);
    } catch (error) {
      if (current === generation) showError(error);
    } finally {
      if (current === generation) $("#target-account").disabled = false;
    }
  }
  for (const id of ["#account-role", "#account-active"])
    $(id).onchange = () => {
      offset = 0;
      void load();
    };
  $("#previous").onclick = () => {
    offset = Math.max(0, offset - 50);
    void load();
  };
  $("#next").onclick = () => {
    offset += 50;
    void load();
  };
  $("#target-account").onchange = () => {
    $("#account-action-form").reset();
    action();
    target();
  };
  function action() {
    const reset = $("#account-action").value === "reset-password";
    $("#temporary-field").hidden = !reset;
    $("#temporary-password").required = reset;
    if (!reset) $("#temporary-password").value = "";
  }
  $("#account-action").onchange = action;
  $("#account-action-form").onsubmit = async (event) => {
    event.preventDefault();
    const row = selected();
    if (!row) return;
    const button = event.target.querySelector("button"),
      choice = $("#account-action").value;
    const body = {
      currentPassword: $("#registrar-password").value,
      reason: $("#account-reason").value,
    };
    if (choice === "reset-password")
      body.temporaryPassword = $("#temporary-password").value;
    if (["enable", "disable"].includes(choice))
      body.isActive = choice === "enable";
    button.disabled = true;
    showError(null);
    notice("");
    try {
      await api(
        `/admin/accounts/${row.id}/${["enable", "disable"].includes(choice) ? "status" : choice}`,
        {
          method: ["enable", "disable"].includes(choice) ? "PATCH" : "POST",
          body,
          retry: false,
        },
      );
      event.target.reset();
      action();
      await load();
      notice(
        choice === "reset-password"
          ? `Password reset for ${row.name}. Share the temporary password privately. They must change it at sign-in.`
          : `Account action saved for ${row.name}. Their previous sign-ins have ended.`,
      );
    } catch (error) {
      showError(error);
    } finally {
      $("#registrar-password").value = "";
      $("#temporary-password").value = "";
      button.disabled = false;
    }
  };
  action();
  await load();
}
