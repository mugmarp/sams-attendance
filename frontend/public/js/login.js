import { api, cachedUser, saveSession } from "./api.js";
import { $, home, showError } from "./common.js";
const existing = cachedUser();
if (existing && localStorage.getItem("accessToken"))
  location.replace(home(existing.role));
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#submit");
  button.disabled = true;
  button.textContent = "Signing in…";
  showError(null);
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { email: $("#email").value, password: $("#password").value },
    });
    saveSession(data);
    location.assign(home(data.user.role));
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
};
