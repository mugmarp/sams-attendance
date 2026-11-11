import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoad, formatTime } from "../hooks/useLoad";
import { api, message } from "../services/api";
import type { Session, RosterRow, AttendanceStatus } from "../types/api";
export function ExaminerSession() {
  const { id } = useParams();
  const session = useLoad<Session>(`/examiner/sessions/${id}`, 5000);
  const roster = useLoad<RosterRow[]>(
    `/examiner/sessions/${id}/attendance`,
    5000,
  );
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<RosterRow | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("PRESENT");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const action = async (path: string, data?: object) => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/examiner/sessions/${id}/${path}`, data);
      await Promise.all([session.reload(), roster.reload()]);
      setEditing(null);
      setConfirm(null);
      setReason("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const s = session.data;
  const rows = roster.data ?? [];
  if (session.loading) return <p role="status">Loading class…</p>;
  if (!s)
    return (
      <p role="alert" className="alert">
        {session.error || "Class unavailable"}
      </p>
    );
  const code =
    s.activeCode && new Date(s.activeCode.expiresAt).getTime() > now
      ? s.activeCode
      : null;
  const inProgress =
    s.status === "SCHEDULED" &&
    now >= new Date(s.startTime).getTime() &&
    now < new Date(s.endTime).getTime();
  const count = rows.filter(
    (r) => r.attendance && ["PRESENT", "LATE"].includes(r.attendance.status),
  ).length;
  return (
    <div className="space-y-6">
      <Link to="/examiner/dashboard" className="text-primary-700">
        ← Classes
      </Link>
      <div className="page-heading">
        <div>
          <h1>
            {s.courseCode} · {s.courseTitle}
          </h1>
          <p>
            {formatTime(s.startTime)} – {formatTime(s.endTime)} · {s.room} ·{" "}
            {s.status.toLowerCase()}
          </p>
        </div>
        <span className="badge-info">
          {count} / {rows.length} attended
        </span>
      </div>
      {(error || session.error || roster.error) && (
        <p role="alert" className="alert">
          {error || session.error || roster.error}
        </p>
      )}
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Student check-in</h2>
        {code ? (
          <div className="bg-slate-900 text-white rounded-xl p-6 text-center">
            <p className="text-slate-300 text-sm">Current code</p>
            <p
              className="font-mono text-4xl sm:text-5xl tracking-widest my-4"
              aria-label="Current check-in code"
            >
              {code.code}
            </p>
            <p className="text-sm">
              Changes in{" "}
              {Math.max(
                0,
                Math.ceil((new Date(code.expiresAt).getTime() - now) / 1000),
              )}
              s · window closes {formatTime(code.closesAt)}
            </p>
          </div>
        ) : (
          <p>
            {inProgress
              ? "Check-in is closed. Open a ten-minute window when students are ready."
              : "Check-in can only open while this scheduled class is in progress."}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {code ? (
            <button
              disabled={busy}
              className="btn-secondary"
              onClick={() => void action("stop-checkin")}
            >
              Stop check-in
            </button>
          ) : (
            <button
              disabled={busy || !inProgress}
              className="btn-primary"
              onClick={() => void action("start-checkin")}
            >
              Start check-in
            </button>
          )}
          {s.status === "SCHEDULED" && (
            <>
              <button
                className="btn-secondary"
                disabled={busy || now < new Date(s.startTime).getTime()}
                onClick={() => setConfirm("complete")}
              >
                Complete class
              </button>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => setConfirm("cancel")}
              >
                Cancel class
              </button>
            </>
          )}
        </div>
        {confirm && (
          <div className="bg-amber-50 p-4 rounded space-y-3" role="alert">
            <p>
              {confirm === "complete"
                ? "Completing this class closes check-in and includes it in attendance percentages. Missing records count as absent."
                : "Cancelling closes check-in and excludes this class from attendance percentages."}{" "}
              This class cannot be reopened.
            </p>
            <button
              className="btn-primary mr-2"
              disabled={busy}
              onClick={() => void action(confirm)}
            >
              Confirm {confirm}
            </button>
            <button className="btn-secondary" onClick={() => setConfirm(null)}>
              Keep class open
            </button>
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Class register</h2>
        <p className="text-sm text-slate-600 mb-4">
          Updates every five seconds. Corrections require a reason and are
          recorded in the change history.
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Attendance</th>
                <th>Recorded</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.student.id}>
                  <td>
                    <strong>{row.student.name}</strong>
                    <br />
                    <span className="text-xs">{row.student.regNo}</span>
                  </td>
                  <td>
                    {row.attendance?.status ??
                      (s.status === "COMPLETED"
                        ? "ABSENT (no record)"
                        : "Not recorded")}
                  </td>
                  <td>
                    {row.attendance
                      ? `${row.attendance.method} · ${formatTime(row.attendance.recordedAt)}`
                      : "—"}
                    {row.attendance && row.attendance.changes.length > 0 && (
                      <details className="text-xs mt-2">
                        <summary>Change history</summary>
                        {row.attendance.changes.map((c) => (
                          <p key={c.id}>
                            {c.actor.name}: {c.previousStatus ?? "unrecorded"} →{" "}
                            {c.status}. {c.reason} ({formatTime(c.recordedAt)})
                          </p>
                        ))}
                      </details>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-secondary text-sm"
                      disabled={
                        s.status === "CANCELLED" ||
                        now < new Date(s.startTime).getTime()
                      }
                      onClick={() => {
                        setEditing(row);
                        setStatus(row.attendance?.status ?? "PRESENT");
                        setReason("");
                      }}
                    >
                      Correct
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>No students enrolled.</p>}
      </section>
      {editing && (
        <section
          className="card border-primary-300"
          aria-label="Attendance correction"
        >
          <h2 className="font-semibold mb-4">
            Correct attendance · {editing.student.name}
          </h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action("attendance", {
                studentId: editing.student.id,
                status,
                reason,
              });
            }}
          >
            <label className="block">
              Attendance status
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
              >
                {["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Reason
              <textarea
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={5}
                maxLength={500}
                required
              />
            </label>
            <button disabled={busy} className="btn-primary mr-2">
              Save correction
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(null)}
            >
              Close
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
