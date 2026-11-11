import { Link } from "react-router-dom";
import { useLoad } from "../hooks/useLoad";
import type { Course } from "../types/api";
export function AdminCourses() {
  const { data, error, loading, reload } = useLoad<Course[]>("/admin/courses");
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <h1>Course attendance reports</h1>
          <p>
            Choose a course offering to review attendance qualification and
            export a report.
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
        <p role="status">Loading courses…</p>
      ) : !data?.length ? (
        <div className="card">
          No courses available. Import course data before taking attendance.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((c) => (
            <Link
              className="card block hover:border-primary-400"
              to={`/admin/eligibility/${c.id}`}
              key={c.id}
            >
              <span className="font-mono text-primary-700">{c.code}</span>
              <h2 className="text-lg font-semibold mt-2">{c.title}</h2>
              <p className="text-sm text-slate-600 mt-2">
                {c.academicYear} · Semester {c.semester} · {c.program}
              </p>
              <p className="text-sm mt-2">
                {c.examiner?.name} · {c._count?.enrollments ?? 0} enrolled
                students
              </p>
              <p className="text-primary-700 mt-4 text-sm">
                View attendance report →
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
