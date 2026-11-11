import { useState } from "react";
import { Link } from "react-router-dom";
import { useLoad, formatTime } from "../hooks/useLoad";
import type { Session } from "../types/api";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function ExaminerDashboard() {
  const [date, setDate] = useState(today());
  const { data, error, loading, reload } = useLoad<Session[]>(
    `/examiner/sessions/today?date=${date}`,
    10000,
  );
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <h1>Class attendance</h1>
          <p>
            Open a class to start check-in, review its roster or complete the
            register.
          </p>
        </div>
        <label>
          Date (Kampala)
          <input
            className="input mt-1"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}{" "}
          <button className="underline" onClick={() => void reload()}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading classes…</p>
      ) : !data?.length ? (
        <div className="card">
          No classes on this date. Select another date or ask your administrator
          to check the timetable.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((s) => (
            <Link
              key={s.id}
              to={`/examiner/session/${s.id}`}
              className="card block hover:border-primary-400"
            >
              <div className="flex justify-between gap-2">
                <span className="font-mono text-primary-700">
                  {s.courseCode}
                </span>
                <span className="badge-info">{s.status.toLowerCase()}</span>
              </div>
              <h2 className="text-lg font-semibold mt-3">{s.courseTitle}</h2>
              <p className="text-sm text-slate-600 mt-2">
                {formatTime(s.startTime)} – {formatTime(s.endTime)} ·{" "}
                {s.room ?? "Room TBA"}
              </p>
              <p className="text-sm mt-4 text-primary-700">
                {s.hasActiveCode ? "Check-in is open" : "Open class →"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
