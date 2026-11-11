import { useLoad } from "../hooks/useLoad";
import type { Summary } from "../types/api";
export function StudentSummary() {
  const { data, error, loading, reload } = useLoad<Summary[]>(
    "/student/attendance/summary",
    15000,
  );
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="page-heading">
        <div>
          <h1>My attendance</h1>
          <p>
            Only completed classes count. Present and late records count as
            attendance.
          </p>
        </div>
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
        <p role="status">Loading attendance…</p>
      ) : !data?.length ? (
        <div className="card">
          You are not enrolled in any courses. Contact your course
          administrator.
        </div>
      ) : (
        data.map((c) => (
          <article className="card space-y-3" key={c.courseId}>
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-primary-700 font-mono">{c.courseCode}</p>
                <h2 className="text-lg font-semibold">{c.courseTitle}</h2>
                <p className="text-sm text-slate-600">
                  {c.academicYear} · Semester {c.semester}
                </p>
              </div>
              <strong className="text-2xl">
                {c.attendancePct === null
                  ? "—"
                  : `${c.attendancePct.toFixed(1)}%`}
              </strong>
            </div>
            <p>
              {c.presentCount} attended / {c.totalSessions} completed classes
            </p>
            <div className="h-2 rounded bg-slate-100">
              <div
                className={`h-2 rounded ${c.eligible ? "bg-green-600" : "bg-amber-500"}`}
                style={{ width: `${c.attendancePct ?? 0}%` }}
              />
            </div>
            <p className="text-sm">
              {c.attendancePct === null
                ? "Not assessed: no completed classes."
                : c.eligible
                  ? "Attendance requirement met (at least 80%)."
                  : "Below the 80% attendance requirement."}
            </p>
          </article>
        ))
      )}
      <p className="text-sm text-slate-600">
        This is an attendance report, not final examination clearance. Fees and
        coursework are assessed separately. Contact your examiner if a record
        needs correcting.
      </p>
    </div>
  );
}
