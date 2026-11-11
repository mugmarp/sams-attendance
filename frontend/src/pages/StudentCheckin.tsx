import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useLoad, formatTime } from "../hooks/useLoad";
import { api, message, networkError } from "../services/api";
import {
  attempts,
  discard,
  queueAttempt,
  syncAttempts,
  Attempt,
} from "../services/offline";
import type { Session } from "../types/api";
export function StudentCheckin() {
  const { user } = useAuth();
  const sessions = useLoad<Session[]>("/student/sessions/upcoming", 10000);
  const [selected, setSelected] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<Attempt[]>([]);
  const refreshQueue = useCallback(() => {
    if (user)
      void attempts(user.id)
        .then(setQueue)
        .catch((e) => setError(message(e)));
  }, [user]);
  useEffect(() => {
    refreshQueue();
    const sync = () => {
      if (user)
        void syncAttempts(user.id)
          .then(() => sessions.reload())
          .catch((e) => setError(message(e)));
    };
    window.addEventListener("sams:queue", refreshQueue);
    window.addEventListener("online", sync);
    sync();
    return () => {
      window.removeEventListener("sams:queue", refreshQueue);
      window.removeEventListener("online", sync);
    };
  }, [user, refreshQueue, sessions.reload]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post("/student/checkin", { sessionId: selected, code });
      setNotice("Attendance recorded by the server.");
      setCode("");
      await discard(`${user.id}:${selected}`);
      await sessions.reload();
    } catch (e) {
      if (networkError(e)) {
        try {
          await queueAttempt({
            userId: user.id,
            sessionId: selected,
            code,
            courseCode:
              sessions.data?.find((s) => s.id === selected)?.courseCode ??
              "Saved class",
          });
          setNotice(
            "Saved as pending. This is not recorded attendance. Reconnect before the code expires, or ask your examiner for a correction.",
          );
          setCode("");
        } catch {
          setError(
            "Could not save on this device. Ask your examiner to record attendance.",
          );
        }
      } else setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="page-heading">
        <div>
          <h1>Check in to class</h1>
          <p>
            Select your class and enter the six-character code displayed by your
            examiner.
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <form className="card space-y-4" onSubmit={(e) => void submit(e)}>
        {sessions.error && (
          <p role="alert">
            {sessions.error}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void sessions.reload()}
            >
              Retry
            </button>
          </p>
        )}
        <label className="block">
          Class
          <select
            className="input mt-1"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a class</option>
            {sessions.data?.map((s) => (
              <option key={s.id} value={s.id} disabled={s.checkedIn}>
                {s.courseCode} · {formatTime(s.startTime)}
                {s.checkedIn
                  ? " · recorded"
                  : s.hasActiveCode
                    ? " · check-in open"
                    : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Check-in code
          <input
            className="input mt-1 font-mono text-2xl tracking-widest"
            autoComplete="off"
            spellCheck={false}
            required
            pattern="[A-HJ-NP-Z2-9]{6}"
            minLength={6}
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7K9M2P"
          />
        </label>
        <button
          className="btn-primary"
          disabled={busy || !selected || code.length !== 6}
        >
          {busy ? "Submitting…" : "Record attendance"}
        </button>
      </form>
      <section className="card">
        <h2 className="text-lg font-semibold">Your classes</h2>
        {sessions.loading ? (
          <p role="status">Loading…</p>
        ) : !sessions.data?.length ? (
          <p className="mt-3">
            No current or upcoming classes in the next 14 days.
          </p>
        ) : (
          <ul className="divide-y mt-3">
            {sessions.data.map((s) => (
              <li key={s.id} className="py-3 flex justify-between gap-4">
                <div>
                  <strong>
                    {s.courseCode} · {s.courseTitle}
                  </strong>
                  <p className="text-sm text-slate-600">
                    {formatTime(s.startTime)} · {s.room ?? "Room TBA"}
                  </p>
                </div>
                <span className="text-sm">
                  {s.checkedIn
                    ? "Recorded"
                    : s.hasActiveCode
                      ? "Check-in open"
                      : "Not open"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Saved attempts</h2>
        <p className="text-sm text-slate-600">
          Pending attempts are sent when you reconnect while this app is open.
          Expired codes are rejected. Device timestamps do not establish
          attendance.
        </p>
        {!queue.length ? (
          <p>No saved attempts.</p>
        ) : (
          queue.map((a) => (
            <div className="border rounded p-3" key={a.id}>
              <strong>
                {a.courseCode} · {a.state.toLowerCase()}
              </strong>
              <p className="text-sm">
                Saved {formatTime(a.createdAt)}. {a.error}
              </p>
              {a.state === "FAILED" && (
                <p className="text-sm">
                  Ask your examiner to review this attempt. It has not been
                  counted.
                </p>
              )}
              <button
                className="underline text-sm"
                onClick={() =>
                  void discard(a.id).catch((e) => setError(message(e)))
                }
              >
                Remove saved attempt
              </button>
            </div>
          ))
        )}
        {queue.some((a) => a.state === "PENDING") && (
          <button
            className="btn-secondary"
            onClick={() =>
              user &&
              void syncAttempts(user.id)
                .then(() => sessions.reload())
                .catch((e) => setError(message(e)))
            }
          >
            Send pending attempts
          </button>
        )}
      </section>
    </div>
  );
}
