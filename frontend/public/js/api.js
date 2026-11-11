let refreshPromise = null;
export function saveSession(data) {
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  localStorage.setItem("user", JSON.stringify(data.user));
}
export function clearSession() {
  for (const key of ["accessToken", "refreshToken", "user"])
    localStorage.removeItem(key);
}
export function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    clearSession();
    return null;
  }
}
export async function api(path, { method = "GET", body, retry = true } = {}) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(localStorage.getItem("accessToken")
          ? { Authorization: "Bearer " + localStorage.getItem("accessToken") }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error("Unable to reach SAMS. Check your connection.");
    error.network = true;
    throw error;
  }
  if (
    response.status === 401 &&
    retry &&
    !["/auth/login", "/auth/refresh"].includes(path)
  ) {
    if (!refreshPromise)
      refreshPromise = api("/auth/refresh", {
        method: "POST",
        body: { refreshToken: localStorage.getItem("refreshToken") },
        retry: false,
      })
        .then((data) => {
          saveSession(data);
        })
        .finally(() => {
          refreshPromise = null;
        });
    try {
      await refreshPromise;
    } catch (error) {
      if (!error.network) {
        clearSession();
        location.assign("/login");
      }
      throw error;
    }
    return api(path, { method, body, retry: false });
  }
  const json = response.headers
    .get("Content-Type")
    ?.includes("application/json");
  const data = json ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(
      data.message || "The request could not be completed.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
