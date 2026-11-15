import { api, cachedUser, saveSession } from "./api.js";
import { $, home, showError } from "./common.js";
const existing = cachedUser();
if (existing) location.replace(home(existing.role));
else {
  document.querySelector("[data-page-content]").hidden = false;
  $("#page-loading").hidden = true;
}
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#submit");
  button.disabled = true;
  button.textContent = "Signing in…";
  showError(null);
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { identifier: $("#email").value, password: $("#password").value },
    });
    saveSession(data);
    location.assign(
      data.user.mustChangePassword ? "/account" : home(data.user.role),
    );
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
};
