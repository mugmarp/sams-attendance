import {
  api,
  cachedUser,
  clearSession,
  captureSession,
  sameSession,
  updateUser,
  retryable,
} from "./api.js";
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
let serverOffset = 0;
export const currentDate = () => new Date(Date.now() + serverOffset);
export const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(currentDate());
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
  if (!user) {
    location.replace("/login");
    return null;
  }
  const session = captureSession(user.id);
  const checkIdentity = () => {
    if (!sameSession(session)) location.replace("/login");
  };
  addEventListener("sams:session", checkIdentity);
  try {
    user = await api("/auth/me", { session });
    updateUser(user, session);
  } catch (error) {
    if (!retryable(error)) {
      clearSession(session);
      location.replace("/login");
      return null;
    }
  }
  if (user.mustChangePassword && location.pathname !== "/account") {
    location.replace("/account");
    return null;
  }
  if (!roles.includes(user.role)) {
    location.replace(home(user.role));
    return null;
  }
  let clockFlight = null,
    lastClockSync = -Infinity;
  const refreshClock = () => {
    if (clockFlight || performance.now() - lastClockSync < 15000)
      return clockFlight;
    const started = Date.now();
    clockFlight = api("/health")
      .then((health) => {
        const timestamp = Date.parse(health.now);
        if (Number.isFinite(timestamp))
          serverOffset = timestamp - (started + Date.now()) / 2;
        lastClockSync = performance.now();
      })
      .catch(() => {})
      .finally(() => {
        clockFlight = null;
      });
    return clockFlight;
  };
  await refreshClock();
  addEventListener("online", refreshClock);
  addEventListener("focus", refreshClock);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshClock();
  });
  setInterval(() => {
    if (!document.hidden) refreshClock();
  }, 300000);
  if (
    user.role === "STUDENT" &&
    location.pathname !== "/student/courses" &&
    location.pathname !== "/account"
  ) {
    try {
      await api("/student/course-setup", { method: "POST", body: {}, session });
    } catch {
      /* Keep the existing workspace available; My courses shows setup errors. */
    }
  }
  const links =
    user.role === "STUDENT"
      ? [
          ["/student/checkin", "Check in"],
          ["/student/summary", "My attendance"],
          ["/student/courses", "My courses"],
        ]
      : user.role === "ADMIN"
        ? [
            ["/admin/courses", "Course reports"],
            ["/examiner/dashboard", "Classes"],
          ]
        : [["/examiner/dashboard", "My classes"]];
  links.push(["/timetable", "Timetable"]);
  if (user.role === "ADMIN")
    links.push(["/admin/timetable", "Timetable setup"]);
  if (user.role === "ADMIN") links.push(["/admin/accounts", "Accounts"]);
  if (user.role === "ADMIN")
    links.push(["/admin/course-plans", "Course setup"]);
  links.push(["/account", "My account"]);
  const icons = {
    "/student/courses": '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/>',
    "/admin/course-plans": '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h4"/>',
    "/account":
      '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    "/admin/accounts":
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5h4m-2-2v4M17 12h4"/>',
    "/timetable":
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 11h18M8 3v4M16 3v4"/>',
    "/admin/timetable":
      '<path d="M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M10 17v4"/>',
    "/admin/courses": '<path d="M4 19V5m0 14h16M8 15v-4m5 4V7m5 8v-7"/>',
    "/examiner/dashboard":
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    "/student/checkin":
      '<path d="m5 12 4 4L19 6"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    "/student/summary": '<path d="M4 19V5m0 14h16M8 15v-4m5 4V7m5 8v-7"/>',
  };
  const active = (path) =>
    location.pathname === path ||
    (path === "/admin/courses" &&
      location.pathname.startsWith("/admin/eligibility/")) ||
    (path === "/examiner/dashboard" &&
      location.pathname.startsWith("/examiner/"));
  const title =
    location.pathname.includes("/eligibility/") ||
    location.pathname.includes("/report/")
      ? "Attendance report"
      : location.pathname.includes("/session/")
        ? "Class register"
        : links.find(([path]) => active(path))?.[1] || "Attendance";
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join("");
  document.body.classList.add("workspace");
  $("#site-header").innerHTML =
    `<aside class="sidebar"><a class="brand" href="${home(user.role)}"><span class="brand-mark">S</span><span>SAMS<small>MUST attendance</small></span></a><p class="nav-caption">WORKSPACE</p><nav aria-label="Main navigation">${links.map(([path, label]) => `<a href="${path}" ${active(path) ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[path]}</svg>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="profile"><span class="avatar">${escape(initials)}</span><div><strong>${escape(user.name)}</strong><small>${user.role === "EXAMINER" ? "Lecturer" : user.role === "ADMIN" ? "Registrar" : "Student"}</small></div></div><button id="logout">Sign out</button></div></aside><div class="workspace-topbar"><span class="workspace-title">${escape(title)}</span><div class="workspace-date"><time id="current-date"></time><span>Africa/Kampala · EAT</span></div></div>`;
  const renderDate = () => {
    const date = currentDate();
    $("#current-date").dateTime = date.toISOString();
    $("#current-date").textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Kampala",
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  };
  renderDate();
  setInterval(renderDate, 30000);
  $("#site-header").hidden = false;
  $("#logout").onclick = () => {
    clearSession(session);
    location.assign("/login");
  };
  const online = () => {
    $("#offline").hidden = navigator.onLine;
    $("#offline").className = "header-inner offline";
  };
  online();
  addEventListener("online", online);
  addEventListener("offline", online);
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || document.querySelector("#application-update"))
        return;
      const banner = document.createElement("aside");
      banner.id = "application-update";
      banner.className = "notice";
      banner.setAttribute("role", "status");
      banner.textContent =
        "An application update is ready. Save any unfinished form before reloading. Saved attendance attempts remain on this device. ";
      const button = document.createElement("button");
      button.textContent = "Reload application";
      button.onclick = () => location.reload();
      banner.append(button);
      document.querySelector("main").prepend(banner);
    });
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  return user;
}
