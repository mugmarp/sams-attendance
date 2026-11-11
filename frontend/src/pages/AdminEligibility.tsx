import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoad } from "../hooks/useLoad";
import { api, message } from "../services/api";
import type { EligibilityResponse } from "../types/api";
export function AdminEligibility() {
  const { courseId } = useParams();
  const { data, loading, error, reload } = useLoad<EligibilityResponse>(
    `/admin/eligibility/${courseId}`,
    15000,
  );
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const download = async () => {
    setBusy(true);
    setExportError("");
    try {
      const response = await api.get(`/admin/eligibility/${courseId}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.course.code ?? "course"}-attendance.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const students = data?.students ?? [];
  const met = students.filter((s) => s.eligible).length;
  const visible = students.filter(
    (s) =>
      filter === "all" ||
      (filter === "met"
        ? s.eligible
        : filter === "below"
          ? s.attendancePct !== null && !s.eligible
          : s.attendancePct === null),
  );
  return (
    <div className="space-y-6">
      <Link className="text-primary-700" to="/admin/courses">
        ← Course reports
      </Link>
      <div className="page-heading">
        <div>
          <h1>Attendance qualification</h1>
          <p>
            {data
              ? `${data.course.code} · ${data.course.title} · ${data.course.academicYear}, Semester ${data.course.semester}`
              : "Course report"}
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={busy || !data}
          onClick={() => void download()}
        >
          {busy ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
      {(error || exportError) && (
        <p className="alert" role="alert">
          {error || exportError}{" "}
          <button className="underline" onClick={() => void reload()}>
            Retry report
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading report…</p>
      ) : (
        data && (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                ["Enrolled", students.length],
                ["Attendance requirement met", met],
                [
                  "Not assessed",
                  students.filter((s) => s.attendancePct === null).length,
                ],
              ].map(([label, value]) => (
                <div className="card" key={label}>
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="text-3xl font-semibold mt-2">{value}</p>
                </div>
              ))}
            </div>
            <section className="card space-y-4">
              <label className="block sm:max-w-xs">
                Show students
                <select
                  className="input"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All students</option>
                  <option value="met">Requirement met</option>
                  <option value="below">Below requirement</option>
                  <option value="none">Not assessed</option>
                </select>
              </label>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Attended</th>
                      <th>Completed</th>
                      <th>Attendance</th>
                      <th>Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => (
                      <tr key={s.studentId}>
                        <td>
                          <strong>{s.name}</strong>
                          <br />
                          <span className="text-xs">{s.regNo}</span>
                        </td>
                        <td>{s.presentCount}</td>
                        <td>{s.totalSessions}</td>
                        <td>
                          {s.attendancePct === null
                            ? "—"
                            : `${s.attendancePct.toFixed(1)}%`}
                        </td>
                        <td>
                          {s.attendancePct === null
                            ? "Not assessed"
                            : s.eligible
                              ? "Met"
                              : "Below 80%"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length && <p>No students match this filter.</p>}
            </section>
            <p className="text-sm text-slate-600">
              {data.rules} This prototype export is not an official examination
              register.
            </p>
          </>
        )
      )}
    </div>
  );
}
