import PDFDocument from "pdfkit";
import { getCourseEligibility } from "./eligibility.js";
export async function generateEligibilityPDF(courseId, frozenReport) {
  const { course, students } =
    frozenReport ?? (await getCourseEligibility(courseId));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const widths = [25, 120, 165, 55, 65, 85];
    const row = (cells, y, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      let x = 40;
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, {
          width: widths[i] - 5,
          height: 28,
          ellipsis: true,
        });
        x += widths[i];
      });
    };
    const header = () => {
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .text("MUST - SAMS Attendance Report");
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`${course.code}: ${course.title}`)
        .text(
          `${course.academicYear} / Semester ${course.semester} | ${course.program} | Policy v${course.policyVersion || 1} | Threshold: ${course.attendanceThreshold}%`,
        )
        .text(
          `${frozenReport ? "Saved snapshot" : "Live report"}: ${new Date(frozenReport?.generatedAt || Date.now()).toLocaleString("en-GB", { timeZone: "Africa/Kampala" })} EAT`,
        );
      doc
        .fontSize(8)
        .text(
          `Counts: PRESENT${course.countLate !== false ? "/LATE" : ""}${course.countExcused ? "/EXCUSED" : ""}. Denominators follow recorded enrollment dates.`,
        );
      doc
        .fontSize(8)
        .text(
          "Prototype attendance report. Not an official examination register or final exam clearance.",
        );
      row(
        [
          "#",
          "Registration",
          "Student",
          "Attended",
          "Completed",
          "Attendance rule",
        ],
        120,
        true,
      );
    };
    header();
    let y = 150;
    students.forEach((s, i) => {
      if (y > 730) {
        doc.addPage();
        header();
        y = 150;
      }
      row(
        [
          String(i + 1),
          s.regNo,
          s.name,
          String(s.presentCount),
          String(s.totalSessions),
          s.attendancePct === null
            ? "Not assessed"
            : `${s.attendancePct.toFixed(1)}% / ${s.eligible ? "Met" : "Below"}`,
        ],
        y,
      );
      y += 30;
    });
    if (!students.length) doc.fontSize(10).text("No enrolled students.", 40, y);
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc
        .font("Helvetica")
        .fontSize(8)
        .text(`Confidential | Page ${p + 1} of ${range.count}`, 40, 785, {
          width: 515,
          align: "center",
          lineBreak: false,
        });
    }
    doc.end();
  });
}
