const SESSION_KEY = "sams.session.v1";
let refreshFlight = null;
const recordKey = (id) => "sams.session.record:" + id;
const endedKey = (id) => "sams.session.ended:" + id;
function readSession(id) {
  return id && !localStorage.getItem(endedKey(id))
    ? JSON.parse(localStorage.getItem(recordKey(id)) || "null")
    : null;
}
const changed = () => dispatchEvent(new Event("sams:session"));
export function identityError() {
  const error = new Error(
    "Your sign-in changed. Reopen SAMS with the correct account.",
  );
  error.identity = true;
  return error;
}
export function currentSession() {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) return readSession(saved);
    // Preserve sign-ins from the previous client without retaining two token stores.
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!user?.id || !accessToken) return null;
    const session = {
      id: crypto.randomUUID(),
      user,
      accessToken,
      refreshToken,
    };
    localStorage.setItem(recordKey(session.id), JSON.stringify(session));
    localStorage.setItem(SESSION_KEY, session.id);
    for (const key of ["user", "accessToken", "refreshToken"])
      localStorage.removeItem(key);
    return session;
  } catch {
    return null;
  }
}
export function captureSession(userId) {
  const session = currentSession();
  if (!session || (userId && session.user.id !== userId)) throw identityError();
  return session;
}
export function sameSession(session) {
  const current = currentSession();
  return (
    !!session &&
    current?.id === session.id &&
    current.user.id === session.user.id
  );
}
export function saveSession(data) {
  const previous = currentSession();
  const session = { ...data, id: crypto.randomUUID() };
  localStorage.setItem(recordKey(session.id), JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, session.id);
  if (previous) {
    localStorage.setItem(endedKey(previous.id), "1");
    localStorage.removeItem(recordKey(previous.id));
  }
  for (const key of ["user", "accessToken", "refreshToken"])
    localStorage.removeItem(key);
  changed();
}
export function updateUser(user, session) {
  if (!sameSession(session) || user.id !== session.user.id)
    throw identityError();
  localStorage.setItem(
    recordKey(session.id),
    JSON.stringify({ ...readSession(session.id), user }),
  );
}
export function clearSession(session) {
  const ending = session || currentSession();
  if (ending) {
    // A terminal marker prevents a late refresh from resurrecting this sign-in.
    // Never remove the active pointer: another tab may already have switched it.
    localStorage.setItem(endedKey(ending.id), "1");
    localStorage.removeItem(recordKey(ending.id));
  }
  for (const key of ["accessToken", "refreshToken", "user"])
    localStorage.removeItem(key);
  changed();
}
export const cachedUser = () => currentSession()?.user || null;
addEventListener("storage", (event) => {
  if (
    event.key === SESSION_KEY ||
    event.key?.startsWith("sams.session.ended:") ||
    event.key === null
  )
    changed();
});
export function retryable(error) {
  return (
    !!error.network ||
    [408, 429].includes(error.status) ||
    (error.status >= 500 && error.status <= 599)
  );
}
export async function api(
  path,
  {
    method = "GET",
    body,
    retry = true,
    expectedUserId,
    session = currentSession(),
  } = {},
) {
  if (expectedUserId && session?.user.id !== expectedUserId)
    throw identityError();
  if (session && !sameSession(session)) throw identityError();
  // Capture credentials before yielding; never read a different account's token on retry.
  const credentials = session ? readSession(session.id) : null;
  if (session && !credentials) throw identityError();
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(credentials?.accessToken
          ? { Authorization: "Bearer " + credentials.accessToken }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    if (session && !sameSession(session)) throw identityError();
    const error = new Error("Unable to reach SAMS. Check your connection.");
    error.network = true;
    throw error;
  }
  if (session && !sameSession(session)) throw identityError();
  if (
    response.status === 401 &&
    retry &&
    session &&
    !["/auth/login", "/auth/refresh"].includes(path)
  ) {
    if (!refreshFlight || refreshFlight.id !== session.id) {
      const flight = { id: session.id };
      flight.promise = api("/auth/refresh", {
        method: "POST",
        body: { refreshToken: credentials.refreshToken },
        retry: false,
        session,
      })
        .then((data) => {
          if (!sameSession(session) || data.user.id !== session.user.id)
            throw identityError();
          localStorage.setItem(
            recordKey(session.id),
            JSON.stringify({ ...data, id: session.id }),
          );
        })
        .finally(() => {
          if (refreshFlight === flight) refreshFlight = null;
        });
      refreshFlight = flight;
    }
    try {
      await refreshFlight.promise;
    } catch (error) {
      if (
        !error.identity &&
        [400, 401, 403].includes(error.status) &&
        sameSession(session)
      ) {
        clearSession(session);
        location.assign("/login");
      }
      throw error;
    }
    return api(path, { method, body, retry: false, session, expectedUserId });
  }
  let data;
  try {
    data = response.headers.get("Content-Type")?.includes("application/json")
      ? await response.json()
      : await response.blob();
  } catch {
    // Headers may arrive before a connection drops during the response body.
    const error = new Error(
      "The server response was interrupted. Please retry.",
    );
    error.network = true;
    throw error;
  }
  if (session && !sameSession(session)) throw identityError();
  if (!response.ok) {
    const error = new Error(
      data.message || "The request could not be completed.",
    );
    error.status = response.status;
    if (data.error === "PASSWORD_CHANGE_REQUIRED") {
      // Pause replay without changing any pending payload or outcome.
      error.identity = true;
      error.requiresPasswordChange = true;
    }
    const after = response.headers.get("Retry-After");
    const delay =
      after === null
        ? 0
        : /^\d+$/.test(after)
          ? Number(after) * 1000
          : Date.parse(after) - Date.now();
    error.retryAfterMs = Number.isFinite(delay) ? Math.max(0, delay) : 0;
    throw error;
  }
  return data;
}
