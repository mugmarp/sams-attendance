import { api, captureSession, clearSession } from "./api.js";
import { $, init, showError } from "./common.js";
const user = await init(["STUDENT", "EXAMINER", "ADMIN"]);
if (user) {
  $("#identity").textContent = `${user.name} · ${user.regNo || user.email}`;
  $("#temporary").hidden = !user.mustChangePassword;
  const end = async (form, path, body) => {
    const session = captureSession(user.id),
      button = form.querySelector("button");
    button.disabled = true;
    showError(null);
    try {
      await api(path, { method: "POST", body, session, retry: false });
      clearSession(session);
      location.assign("/login?account=updated");
    } catch (error) {
      showError(error);
    } finally {
      form.reset();
      button.disabled = false;
    }
  };
  $("#password-form").onsubmit = (event) => {
    event.preventDefault();
    if ($("#new-password").value !== $("#confirm-password").value) {
      showError(new Error("The new passwords do not match."));
      return;
    }
    void end(event.target, "/auth/password", {
      currentPassword: $("#current-password").value,
      newPassword: $("#new-password").value,
    });
  };
  $("#end-form").onsubmit = (event) => {
    event.preventDefault();
    void end(event.target, "/auth/end-signins", {
      currentPassword: $("#end-password").value,
    });
  };
}
