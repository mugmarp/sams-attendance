import { z } from "zod";
export function filters(query) {
  return z
    .object({
      faculty: z.string().max(40).optional(),
      programme: z.string().max(12).optional(),
      group: z.string().max(120).optional(),
      year: z.coerce.number().int().min(1).max(10).optional(),
      semester: z.coerce.number().int().min(1).max(2).optional(),
      academicYear: z
        .string()
        .regex(/^\d{4}\/\d{4}$/)
        .optional(),
      search: z.string().trim().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .parse(query);
}
export function courseWhere(f) {
  const groups = {
    ...(f.faculty ? { programme: { facultyCode: f.faculty } } : {}),
    ...(f.programme ? { programmeCode: f.programme } : {}),
    ...(f.year ? { studyYear: f.year } : {}),
    ...(f.group ? { key: f.group } : {}),
  };
  const scoped = f.faculty || f.programme || f.group || f.year;
  return {
    AND: [
      ...(scoped
        ? [
            {
              OR: [
                {
                  ...(f.faculty
                    ? { programme: { facultyCode: f.faculty } }
                    : {}),
                  ...(f.programme ? { programmeCode: f.programme } : {}),
                  ...(f.year ? { year: f.year } : {}),
                  ...(f.group
                    ? { audiences: { some: { groupKey: f.group } } }
                    : {}),
                },
                { audiences: { some: { group: groups } } },
              ],
            },
          ]
        : []),
      ...(f.semester ? [{ semester: f.semester }] : []),
      ...(f.academicYear ? [{ academicYear: f.academicYear }] : []),
      ...(f.search
        ? [
            {
              OR: [
                { code: { contains: f.search, mode: "insensitive" } },
                { title: { contains: f.search, mode: "insensitive" } },
              ],
            },
          ]
        : []),
    ],
  };
}
export function studentWhere(f) {
  return {
    role: "STUDENT",
    ...(f.faculty ? { programme: { facultyCode: f.faculty } } : {}),
    ...(f.programme ? { programmeCode: f.programme } : {}),
    ...(f.year ? { year: f.year } : {}),
    ...(f.group ? { studyGroupKey: f.group } : {}),
    ...(f.academicYear ? { studyAcademicYear: f.academicYear } : {}),
    ...(f.semester ? { studySemester: f.semester } : {}),
    ...(f.search
      ? {
          OR: [
            { name: { contains: f.search, mode: "insensitive" } },
            { regNo: { contains: f.search, mode: "insensitive" } },
            { email: { contains: f.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
