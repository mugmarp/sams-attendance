// Operator helper: only the confirmed BSE II Friday interval; never records attendance.
import assert from 'node:assert/strict';
const root='/opt/sams/current/backend/';
const {prisma}=await import(root+'src/config/db.js');
const {previewTimetable,applyTimetable}=await import(root+'src/services/timetable.js');
const {latestPublication}=await import(root+'src/services/timetable-source.js');
const [from,to]=process.argv.slice(2);
try {
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(to||''),'Supply two reviewed Friday dates');
 assert.equal(new Date(from+'T12:00:00+03:00').getUTCDay(),5);assert.equal(Date.parse(to)-Date.parse(from),7*86400000);
 const source=await latestPublication();
 const row=source.rows.find(r=>r.program_group==='BSE II'&&r.day==='Friday'&&r.course_code==='SWE2106');assert.ok(row);
 const course=await prisma.course.findUniqueOrThrow({where:{code_academicYear_semester_offeringKey:{code:'SWE2106',academicYear:source.metadata.academic_year,semester:1,offeringKey:'BSE'}}});
 const term=await prisma.academicTerm.findUniqueOrThrow({where:{academicYear_semester:{academicYear:course.academicYear,semester:course.semester}}});
 const admin=await prisma.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true}});const actor={userId:admin.id,role:'ADMIN'};
 const existing=await prisma.timetableEntry.findFirst({where:{courseId:course.id,termId:term.id,sourceKey:row.natural_key}});
 const input={publicationId:source.id,sourceKey:row.natural_key,courseId:course.id,termId:term.id,...(existing?{entryId:existing.id}:{}),weekday:5,startTime:'11:00',endTime:'13:00',room:row.room||'',sessionType:'LECTURE',from,to,reviewed:true,reason:'Operator confirmed on 13 November 2026 that BSE II Friday Web Design is 11:00–13:00 Kampala time; create the next two future sessions under the project lecturer. No historical sessions or attendance marks.'};
 const sessions=await prisma.session.findMany({where:{status:'SCHEDULED',startTime:{lt:new Date(to+'T13:00:00+03:00')},endTime:{gt:new Date(from+'T11:00:00+03:00')},OR:[{course:{examinerId:course.examinerId}},{course:{audiences:{some:{groupKey:'BSE II'}}}},...(row.room?[{room:row.room}]:[])]},include:{course:true}});
 for(const date of [from,to]){
  const start=new Date(date+'T11:00:00+03:00'),end=new Date(date+'T13:00:00+03:00');
  assert.ok(!sessions.some(s=>s.startTime<end&&s.endTime>start&&!(s.courseId===course.id&&s.timetableEntryId===existing?.id)),'Conflicting lecturer, group or room; review manually');
 }
 const before=await prisma.attendance.count();const review=await previewTimetable(actor,input);
 console.log(JSON.stringify({preview:review.summary,warnings:review.warnings,blockers:review.blockers}));assert.equal(review.blockers.length,0);
 await applyTimetable(actor,review.id);
 assert.equal(await prisma.attendance.count(),before,'Attendance count changed during scheduling; inspect concurrent activity');
 const dates=await prisma.session.findMany({where:{courseId:course.id,startTime:{gte:new Date(from+'T00:00:00+03:00'),lte:new Date(to+'T23:59:59+03:00')}},select:{startTime:true,endTime:true,status:true}});
 console.log(JSON.stringify({scheduled:dates,attendanceUnchanged:before}));
}finally{await prisma.$disconnect();}
