import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
// Operational bootstrap only. Credentials go to an exclusively created private file.
const output = process.argv[2];
if (!output || !output.startsWith('/')) throw new Error('Pass an absolute private credential-file path');
const db = new PrismaClient();
let fd;
try {
  if (await db.user.count()) throw new Error('Bootstrap requires an empty User table; existing accounts are never overwritten');
  fd = fs.openSync(output, 'wx', 0o600);
  const definitions = [
    { email: 'admin@demo.sams.test', name: 'Registrar', role: 'ADMIN' },
    { email: 'examiner@demo.sams.test', name: 'Course Lecturer', role: 'EXAMINER' },
    { email: 'student@demo.sams.test', name: 'Student', role: 'STUDENT', regNo: 'SAMS/PILOT/001', program: 'BSE', year: 2 },
  ];
  const accounts = await Promise.all(definitions.map(async (user) => {
    const password = randomBytes(24).toString('base64url');
    return { ...user, password, passwordHash: await bcrypt.hash(password, 12) };
  }));
  // Persist the recovery material before the transaction; passwords are never logged.
  fs.writeFileSync(fd, JSON.stringify({ createdAt: new Date().toISOString(), accounts: accounts.map(({passwordHash,...user}) => user) }, null, 2)+'\n');
  fs.fsyncSync(fd);
  await db.$transaction(async (tx) => {
    // Prevent concurrent operational bootstrap from creating a partial identity set.
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if (await tx.user.count()) throw new Error('Another bootstrap already provisioned accounts');
    for (const { password, ...data } of accounts) await tx.user.create({ data });
  });
  console.log('Three initial accounts created. Read their private credential file on the server; no courses or attendance were seeded.');
} finally {
  if (fd !== undefined) fs.closeSync(fd);
  await db.$disconnect();
}
