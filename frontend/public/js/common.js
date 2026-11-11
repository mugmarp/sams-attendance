import { api, cachedUser, clearSession } from "./api.js";
export const $ = (selector) => document.querySelector(selector);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const time = (value) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const home = (role) =>
  role === "STUDENT"
    ? "/student/checkin"
    : role === "ADMIN"
      ? "/admin/courses"
      : "/examiner/dashboard";
export function showError(error) {
  const node = $("#error");
  node.hidden = !error;
  node.textContent = error?.message || String(error || "");
}
export function notice(text) {
  const node = $("#notice");
  if (node) {
    node.textContent = text;
    node.hidden = !text;
  }
}
export async function init(roles) {
  let user = cachedUser();
  if (!user || !localStorage.getItem("accessToken")) {
    location.replace("/login");
    return null;
  }
  try {
    user = await api("/auth/me");
    localStorage.setItem("user", JSON.stringify(user));
  } catch (error) {
    if (!error.network) {
      clearSession();
      location.replace("/login");
      return null;
    }
  }
  if (!roles.includes(user.role)) {
    location.replace(home(user.role));
    return null;
  }
  const links =
    user.role === "STUDENT"
      ? [
          ["/student/checkin", "Check in"],
          ["/student/summary", "My attendance"],
        ]
      : user.role === "ADMIN"
        ? [
            ["/admin/courses", "Course reports"],
            ["/examiner/dashboard", "Classes"],
          ]
        : [["/examiner/dashboard", "My classes"]];
  $("#site-header").innerHTML =
    `<div class="header-inner"><div class="header-top"><a class="brand" href="${home(user.role)}">SAMS <small>MUST attendance</small></a><div class="account"><span>${escape(user.name)} · ${user.role.toLowerCase()}</span><button id="logout">Sign out</button></div></div><nav aria-label="Main navigation">${links.map(([path, label]) => `<a href="${path}" ${location.pathname === path ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav></div>`;
  $("#site-header").hidden = false;
  $("#logout").onclick = () => {
    clearSession();
    location.assign("/login");
  };
  const online = () => {
    $("#offline").hidden = navigator.onLine;
    $("#offline").className = "header-inner offline";
  };
  online();
  addEventListener("online", online);
  addEventListener("offline", online);
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  return user;
}
