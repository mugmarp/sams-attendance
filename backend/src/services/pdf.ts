// backend/src/services/pdf.ts
import PDFDocument from 'pdfkit';
import { prisma } from '../config/db';
import { getCourseEligibility } from './eligibility';

export interface EligibilityPDFData {
  courseCode: string;
  courseTitle: string;
  program: string;
  year: number;
  semester: number;
  date: Date;
  students: Array<{
    regNo: string;
    name: string;
    presentCount: number;
    totalSessions: number;
    attendancePct: number;
    eligible: boolean;
  }>;
}

export async function generateEligibilityPDF(courseId: string): Promise<Buffer> {
  const { course, students } = await getCourseEligibility(courseId);
  
  // Get course details for program/year/semester
  const courseDetails = await prisma.course.findUnique({
    where: { id: courseId },
    select: { program: true, year: true, semester: true },
  });
  
  const data: EligibilityPDFData = {
    courseCode: course.code,
    courseTitle: course.title,
    program: courseDetails?.program ?? 'N/A',
    year: courseDetails?.year ?? 0,
    semester: courseDetails?.semester ?? 0,
    date: new Date(),
    students,
  };
  
  return createPDF(data);
}

function createPDF(data: EligibilityPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 40,
      info: {
        Title: `Exam Eligibility - ${data.courseCode}`,
        Author: 'MUST SAMS',
        Subject: 'Examination Attendance Register',
      },
    });
    
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Header
    drawHeader(doc, data);
    
    // Table
    drawTable(doc, data);
    
    // Footer
    drawFooter(doc);
    
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, data: EligibilityPDFData) {
  const pageWidth = doc.page.width - 80;
  
  // University name
  doc.fontSize(14).font('Helvetica-Bold')
     .text('MBARARA UNIVERSITY OF SCIENCE AND TECHNOLOGY', 40, 40, { align: 'center' });
  
  // Document title
  doc.fontSize(12).font('Helvetica-Bold')
     .text('EXAMINATION ATTENDANCE REGISTER', 40, 60, { align: 'center' });
  
  // Course info
  doc.fontSize(10).font('Helvetica')
     .text(`Course: ${data.courseCode} - ${data.courseTitle}`, 40, 85)
     .text(`Program: ${data.program} | Year: ${data.year} | Semester: ${data.semester}`, 40, 100)
     .text(`Date: ${data.date.toLocaleDateString('en-GB')}`, 40, 115)
     .text(`Generated: ${data.date.toLocaleString('en-GB')}`, 40, 130);
  
  // Line
  doc.moveTo(40, 145).lineTo(doc.page.width - 40, 145).stroke();
}

function drawTable(doc: PDFKit.PDFDocument, data: EligibilityPDFData) {
  const startY = 155;
  const colWidths = [40, 120, 150, 60, 60, 60, 60];
  const headers = ['No.', 'Reg No.', 'Name', 'Present', 'Total', 'Att. %', 'Eligible'];
  
  let y = startY;
  
  // Table header
  doc.font('Helvetica-Bold').fontSize(8);
  let x = 40;
  headers.forEach((header, i) => {
    doc.text(header, x, y, { width: colWidths[i], align: i === 0 ? 'center' : i === 6 ? 'center' : 'left' });
    x += colWidths[i];
  });
  
  // Header bottom line
  y += 18;
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
  
  // Table rows
  doc.font('Helvetica').fontSize(8);
  
  data.students.forEach((student, index) => {
    // Check page break
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 40;
      // Redraw header on new page
      doc.font('Helvetica-Bold').fontSize(8);
      x = 40;
      headers.forEach((header, i) => {
        doc.text(header, x, y, { width: colWidths[i], align: i === 0 ? 'center' : i === 6 ? 'center' : 'left' });
        x += colWidths[i];
      });
      y += 18;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
      doc.font('Helvetica').fontSize(8);
    }
    
    x = 40;
    const row = [
      String(index + 1),
      student.regNo,
      student.name,
      String(student.presentCount),
      String(student.totalSessions),
      `${student.attendancePct.toFixed(2)}%`,
      student.eligible ? 'YES' : 'NO',
    ];
    
    row.forEach((cell, i) => {
      const align = i === 0 ? 'center' : i === 6 ? 'center' : 'left';
      doc.text(cell, x, y, { width: colWidths[i], align });
      x += colWidths[i];
    });
    
    // Eligibility highlight
    if (!student.eligible) {
      doc.save();
      doc.fillColor('#ff0000');
      doc.text('NO', 40 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], y, { 
        width: colWidths[6], 
        align: 'center' 
      });
      doc.fillColor('#000000');
      doc.restore();
    }
    
    y += 16;
  });
  
  // Bottom line
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
  
  // Summary
  y += 10;
  const eligibleCount = data.students.filter(s => s.eligible).length;
  const totalCount = data.students.length;
  doc.font('Helvetica-Bold').fontSize(10)
     .text(`Summary: ${eligibleCount}/${totalCount} students eligible (${((eligibleCount/totalCount)*100).toFixed(1)}%)`, 40, y);
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica')
       .text(
         'MUST SAMS - Student Attendance Management System | Confidential',
         40,
         doc.page.height - 40,
         { align: 'center', width: doc.page.width - 80 }
       );
  }
}