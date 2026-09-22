import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const WORDS: Record<number, [string, string, string][]> = {
  14: [
    ["abandon", "v.", "버리다, 포기하다"],
    ["accurate", "a.", "정확한"],
    ["acquire", "v.", "얻다, 습득하다"],
    ["adequate", "a.", "충분한, 적절한"],
    ["admire", "v.", "존경하다, 감탄하다"],
    ["adopt", "v.", "입양하다, 채택하다"],
    ["advocate", "v.", "옹호하다, 지지하다"],
    ["alter", "v.", "바꾸다, 변경하다"],
    ["ambiguous", "a.", "모호한, 애매한"],
    ["anticipate", "v.", "예상하다, 기대하다"],
  ],
  15: [
    ["apparent", "a.", "명백한, 겉보기의"],
    ["appreciate", "v.", "감사하다, 진가를 알아보다"],
    ["arbitrary", "a.", "임의의, 독단적인"],
    ["assess", "v.", "평가하다"],
    ["assume", "v.", "가정하다, 떠맡다"],
    ["attribute", "v.", "~의 탓으로 돌리다"],
    ["barrier", "n.", "장벽, 장애물"],
    ["biased", "a.", "편향된, 편견을 가진"],
    ["capable", "a.", "유능한, ~할 수 있는"],
    ["coherent", "a.", "일관된, 논리적인"],
  ],
  16: [
    ["collapse", "v.", "붕괴하다, 무너지다"],
    ["compensate", "v.", "보상하다"],
    ["comprehensive", "a.", "포괄적인, 종합적인"],
    ["conceive", "v.", "상상하다, 생각해내다"],
    ["confront", "v.", "직면하다, 맞서다"],
    ["consequence", "n.", "결과, 영향"],
    ["constitute", "v.", "구성하다"],
    ["contradict", "v.", "모순되다, 반박하다"],
    ["controversy", "n.", "논란, 논쟁"],
    ["crucial", "a.", "결정적인, 중대한"],
  ],
  17: [
    ["deliberate", "a.", "의도적인, 신중한"],
    ["derive", "v.", "얻다, 유래하다"],
    ["deteriorate", "v.", "악화되다"],
    ["devastate", "v.", "황폐시키다"],
    ["diminish", "v.", "줄어들다, 감소하다"],
    ["discard", "v.", "버리다"],
    ["distinct", "a.", "뚜렷한, 별개의"],
    ["dominate", "v.", "지배하다"],
    ["elaborate", "a.", "정교한, 공들인"],
    ["eliminate", "v.", "제거하다"],
  ],
  18: [
    ["embrace", "v.", "받아들이다, 포옹하다"],
    ["emerge", "v.", "나타나다, 떠오르다"],
    ["enhance", "v.", "향상시키다"],
    ["evident", "a.", "분명한, 명백한"],
    ["exaggerate", "v.", "과장하다"],
    ["exploit", "v.", "이용하다, 착취하다"],
    ["facilitate", "v.", "촉진하다, 용이하게 하다"],
    ["fluctuate", "v.", "변동하다"],
    ["fundamental", "a.", "근본적인"],
    ["generate", "v.", "발생시키다, 만들어내다"],
  ],
  19: [
    ["hinder", "v.", "방해하다"],
    ["hypothesis", "n.", "가설"],
    ["imply", "v.", "암시하다, 내포하다"],
    ["inevitable", "a.", "피할 수 없는"],
    ["inherent", "a.", "내재된, 고유의"],
    ["integrate", "v.", "통합하다"],
    ["intrinsic", "a.", "본질적인, 고유한"],
    ["legitimate", "a.", "합법적인, 정당한"],
    ["manipulate", "v.", "조종하다, 조작하다"],
    ["mediate", "v.", "중재하다"],
  ],
  20: [
    ["notion", "n.", "개념, 관념"],
    ["obscure", "a.", "모호한, 잘 알려지지 않은"],
    ["persist", "v.", "지속하다, 고집하다"],
    ["plausible", "a.", "그럴듯한"],
    ["profound", "a.", "심오한, 깊은"],
    ["reluctant", "a.", "꺼리는, 마지못한"],
    ["scrutinize", "v.", "면밀히 조사하다"],
    ["subtle", "a.", "미묘한"],
    ["undermine", "v.", "약화시키다"],
    ["vulnerable", "a.", "취약한"],
  ],
};

async function main() {
  const pw = await bcrypt.hash("password", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@daneobang.dev" },
    update: {},
    create: { email: "admin@daneobang.dev", name: "플랫폼 관리자", passwordHash: pw, isPlatformAdmin: true },
  });
  const owner = await prisma.user.upsert({
    where: { email: "owner@daneobang.dev" },
    update: {},
    create: { email: "owner@daneobang.dev", name: "김원장", passwordHash: pw },
  });
  const teacher = await prisma.user.upsert({
    where: { email: "teacher@daneobang.dev" },
    update: {},
    create: { email: "teacher@daneobang.dev", name: "이선생", passwordHash: pw },
  });
  const studentUser = await prisma.user.upsert({
    where: { email: "student@daneobang.dev" },
    update: {},
    create: { email: "student@daneobang.dev", name: "박학생", passwordHash: pw },
  });
  // 다른 학원 (테넌트 분리 확인용)
  const owner2 = await prisma.user.upsert({
    where: { email: "owner2@daneobang.dev" },
    update: {},
    create: { email: "owner2@daneobang.dev", name: "최원장", passwordHash: pw },
  });

  let academy = await prisma.academy.findUnique({ where: { slug: "hanbit" } });
  if (!academy) {
    academy = await prisma.academy.create({ data: { name: "한빛영어학원", slug: "hanbit", intro: "데모 학원" } });
    const ownerMember = await prisma.academyMember.create({ data: { academyId: academy.id, userId: owner.id, role: "OWNER" } });
    const teacherMember = await prisma.academyMember.create({ data: { academyId: academy.id, userId: teacher.id, role: "TEACHER" } });
    const cls = await prisma.classRoom.create({ data: { academyId: academy.id, name: "중2 A반" } });
    const names = ["박학생", "김민준", "이서연", "정도윤", "최지우"];
    for (const [i, name] of names.entries()) {
      await prisma.student.create({
        data: {
          academyId: academy.id,
          classId: cls.id,
          name,
          school: "한빛중",
          grade: "2",
          userId: i === 0 ? studentUser.id : null,
          teachers: { create: [{ memberId: teacherMember.id }, { memberId: ownerMember.id }] },
        },
      });
    }
    const book = await prisma.vocabBook.create({ data: { academyId: academy.id, createdById: teacher.id, title: "능률 VOCA 고교필수", level: "고1" } });
    for (const dayNo of Object.keys(WORDS).map(Number)) {
      const day = await prisma.bookDay.create({ data: { bookId: book.id, dayNo, label: `DAY ${dayNo}` } });
      let i = 0;
      for (const [english, pos, meaning] of WORDS[dayNo]) {
        await prisma.word.create({ data: { bookId: book.id, dayId: day.id, english, pos, meaning, sortOrder: i++ } });
      }
    }
  }
  let academy2 = await prisma.academy.findUnique({ where: { slug: "sarang" } });
  if (!academy2) {
    academy2 = await prisma.academy.create({ data: { name: "사랑학원", slug: "sarang" } });
    await prisma.academyMember.create({ data: { academyId: academy2.id, userId: owner2.id, role: "OWNER" } });
    await prisma.student.create({ data: { academyId: academy2.id, name: "다른학원학생" } });
  }
  console.log("seed done:", { admin: admin.email, owner: owner.email, teacher: teacher.email, student: studentUser.email });
  await seedTesters();
}

/** 이번 주(Asia/Seoul 월~일) 단어 테스트: 테스트 단어장 DAY 14·15, 20문항, A반 전원 배정. 이미 있으면 건너뜀 */
async function seedWeeklyExam(academyId: string, createdById: string) {
  const offset = 9 * 3600e3;
  const local = new Date(Date.now() + offset);
  const dow = (local.getUTCDay() + 6) % 7;
  const weekStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - offset);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400e3 - 60e3); // 일요일 23:59 KST
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const wk = Math.ceil(local.getUTCDate() / 7);
  const title = `이번 주 단어 테스트 (${mm}월 ${wk}주차)`;
  const exists = await prisma.exam.findFirst({ where: { academyId, title, createdAt: { gte: weekStart } } });
  if (exists) return;
  const book = await prisma.vocabBook.findFirst({ where: { academyId, title: "테스트 단어장" }, include: { days: true } });
  if (!book) return;
  const dayIds = book.days.filter((d) => d.dayNo === 14 || d.dayNo === 15).map((d) => d.id);
  const exam = await prisma.exam.create({
    data: { academyId, bookId: book.id, createdById, title, questionCount: 20, passScore: 90, scoreVisibility: "immediate", answerVisibility: "after_release", scopes: { create: dayIds.map((dayId) => ({ dayId })) } },
  });
  const { createFormForExam } = await import("../src/lib/exam-gen");
  const { form } = await createFormForExam(exam.id);
  await prisma.$transaction([
    prisma.examForm.update({ where: { id: form.id }, data: { status: "published", publishedAt: new Date() } }),
    prisma.exam.update({ where: { id: exam.id }, data: { status: "published" } }),
  ]);
  const classA = await prisma.classRoom.findFirst({ where: { academyId, name: "테스트 A반" } });
  const students = await prisma.student.findMany({ where: { academyId, classId: classA?.id ?? undefined, status: "active" } });
  for (const st of students) await prisma.assignment.create({ data: { examId: exam.id, formId: form.id, studentId: st.id, startAt: weekStart, dueAt: weekEnd } });
  console.log(`weekly exam created: ${title} → ${students.length} students (due ${weekEnd.toISOString()})`);
}

// ───────────── 테스터 계정 (비밀번호 test1234) ─────────────
// 테스트학원(slug: tester): 학원장 1, 선생님 2, 학생 10 (A반 1~5 → 선생님1, B반 6~10 → 선생님2), 플랫폼 관리자 1
// 매 실행 시 비밀번호를 test1234 로 되돌리고 소속·연결을 보정한다 (멱등).
const TESTER_PASSWORD = "test1234";

async function seedTesters() {
  const pw = await bcrypt.hash(TESTER_PASSWORD, 10);
  const upsertUser = (email: string, name: string, isPlatformAdmin = false) =>
    prisma.user.upsert({
      where: { email },
      update: { passwordHash: pw, status: "active", isPlatformAdmin },
      create: { email, name, passwordHash: pw, isPlatformAdmin },
    });

  await upsertUser("tester.admin@daneobang.dev", "테스터 관리자", true);
  const owner = await upsertUser("tester.owner@daneobang.dev", "테스터 학원장");
  const t1 = await upsertUser("tester.t1@daneobang.dev", "테스터 선생님1");
  const t2 = await upsertUser("tester.t2@daneobang.dev", "테스터 선생님2");

  let academy = await prisma.academy.findUnique({ where: { slug: "tester" } });
  if (!academy) academy = await prisma.academy.create({ data: { name: "테스트학원", slug: "tester", intro: "테스터 전용 학원" } });
  if (academy.status !== "active") await prisma.academy.update({ where: { id: academy.id }, data: { status: "active" } });

  const member = (userId: string, role: string) =>
    prisma.academyMember.upsert({
      where: { academyId_userId: { academyId: academy!.id, userId } },
      update: { role, status: "active" },
      create: { academyId: academy!.id, userId, role },
    });
  const mOwner = await member(owner.id, "OWNER");
  const m1 = await member(t1.id, "TEACHER");
  const m2 = await member(t2.id, "TEACHER");
  // 데모 학원장(owner@) 도 테스트학원 OWNER 로 연동 → owner / tester.t1 / tester.s01 이 한 학원 소속
  const demoOwner = await prisma.user.findUnique({ where: { email: "owner@daneobang.dev" } });
  const mDemoOwner = demoOwner ? await member(demoOwner.id, "OWNER") : null;

  const cls = async (name: string) => (await prisma.classRoom.findFirst({ where: { academyId: academy!.id, name } })) ?? prisma.classRoom.create({ data: { academyId: academy!.id, name } });
  const classA = await cls("테스트 A반");
  const classB = await cls("테스트 B반");

  for (let i = 1; i <= 10; i++) {
    const no = String(i).padStart(2, "0");
    const u = await upsertUser(`tester.s${no}@daneobang.dev`, `테스터 학생${no}`);
    const classId = i <= 5 ? classA.id : classB.id;
    const teacherMember = i <= 5 ? m1 : m2;
    let st = await prisma.student.findFirst({ where: { academyId: academy.id, userId: u.id } });
    const school = i % 3 === 0 ? "중앙고" : i % 3 === 1 ? "한빛고" : "세종고";
    const grade = i <= 5 ? "고1" : "고2";
    if (!st) st = await prisma.student.create({ data: { academyId: academy.id, name: `테스터 학생${no}`, school, grade, classId, userId: u.id } });
    else if (st.school === "테스트중") await prisma.student.update({ where: { id: st.id }, data: { school, grade } });
    for (const mid of [teacherMember.id, mOwner.id, ...(mDemoOwner ? [mDemoOwner.id] : [])]) {
      await prisma.teacherStudent.upsert({ where: { memberId_studentId: { memberId: mid, studentId: st.id } }, update: {}, create: { memberId: mid, studentId: st.id } });
    }
  }

  // 테스트용 단어장 (DAY 14~20, 70단어)
  const hasBook = await prisma.vocabBook.findFirst({ where: { academyId: academy.id, title: "테스트 단어장" } });
  if (!hasBook) {
    const book = await prisma.vocabBook.create({ data: { academyId: academy.id, createdById: owner.id, title: "테스트 단어장", level: "고1" } });
    for (const dayNo of Object.keys(WORDS).map(Number)) {
      const day = await prisma.bookDay.create({ data: { bookId: book.id, dayNo, label: `DAY ${dayNo}` } });
      let k = 0;
      for (const [english, pos, meaning] of WORDS[dayNo]) await prisma.word.create({ data: { bookId: book.id, dayId: day.id, english, pos, meaning, sortOrder: k++ } });
    }
  }
  await seedWeeklyExam(academy.id, m1.userId);
  await seedHistory(academy.id, m1.userId);
  await seedNumberedBook(academy.id, owner.id);
  console.log("testers ready: tester.owner / tester.t1 / tester.t2 / tester.s01~s10 / tester.admin @daneobang.dev (password test1234)");
}

/**
 * 지난 8주 채점 이력 (대시보드·추이·워치리스트 확인용). 이미 있으면 건너뜀.
 * 학생마다 기본 실력이 다르고, 학생05·학생09 는 하락 추세, 학생03 은 미응시가 잦다.
 */
async function seedHistory(academyId: string, createdById: string) {
  const marker = await prisma.exam.findFirst({ where: { academyId, title: { startsWith: "지난 주 단어 테스트" } } });
  if (marker) return;
  const book = await prisma.vocabBook.findFirst({ where: { academyId, title: "테스트 단어장" }, include: { days: { orderBy: { dayNo: "asc" } } } });
  if (!book) return;
  const students = await prisma.student.findMany({ where: { academyId, status: "active" }, orderBy: { name: "asc" } });
  const { createFormForExam } = await import("../src/lib/exam-gen");
  const { gradeAttempt } = await import("../src/lib/grading");
  const offset = 9 * 3600e3;
  const local = new Date(Date.now() + offset);
  const dow = (local.getUTCDay() + 6) % 7;
  const thisWeekStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - offset;
  const base = (i: number) => [92, 88, 70, 95, 85, 78, 90, 60, 93, 82][i % 10];
  for (let w = 8; w >= 1; w--) {
    const weekStart = new Date(thisWeekStart - w * 7 * 86400e3);
    const dayIds = [book.days[(8 - w) % book.days.length].id, book.days[(9 - w) % book.days.length].id];
    const exam = await prisma.exam.create({
      data: { academyId, bookId: book.id, createdById, title: `지난 주 단어 테스트 (${w}주 전)`, questionCount: 10, passScore: 90, scoreVisibility: "immediate", answerVisibility: "immediate", answersReleased: true, status: "published", scopes: { create: dayIds.map((dayId) => ({ dayId })) } },
    });
    const { form } = await createFormForExam(exam.id);
    await prisma.examForm.update({ where: { id: form.id }, data: { status: "published", publishedAt: weekStart } });
    const items = await prisma.formItem.findMany({ where: { formId: form.id }, include: { options: true }, orderBy: { position: "asc" } });
    for (const [i, st] of students.entries()) {
      const dueAt = new Date(weekStart.getTime() + 6 * 86400e3 + 23 * 3600e3);
      const submittedAt = new Date(weekStart.getTime() + (2 + (i % 4)) * 86400e3 + 19 * 3600e3);
      // 학생03: 3주에 한 번 미응시 / 학생05·09: 최근으로 올수록 하락
      if (i === 2 && w % 3 === 0) {
        await prisma.assignment.create({ data: { examId: exam.id, formId: form.id, studentId: st.id, startAt: weekStart, dueAt, status: "assigned" } });
        continue;
      }
      let target = base(i) + ((w * 7 + i * 3) % 11) - 5;
      if (i === 4 || i === 8) target = base(i) - (8 - w) * 5;
      target = Math.max(30, Math.min(100, target));
      const correctN = Math.round((target / 100) * items.length);
      const a = await prisma.assignment.create({ data: { examId: exam.id, formId: form.id, studentId: st.id, startAt: weekStart, dueAt, mode: "online", status: "completed" } });
      const attempt = await prisma.attempt.create({ data: { assignmentId: a.id, attemptNo: 1, mode: "online", status: "submitted", startedAt: submittedAt, submittedAt, deadlineAt: dueAt } });
      for (const [k, it] of items.entries()) {
        const correct = it.options.find((o) => o.isCorrect)!;
        const wrong = it.options.find((o) => !o.isCorrect)!;
        await prisma.attemptAnswer.create({ data: { attemptId: attempt.id, itemId: it.id, optionId: k < correctN ? correct.id : wrong.id } });
      }
      await gradeAttempt(attempt.id, { reason: "seed" });
      await prisma.gradeRevision.updateMany({ where: { attemptId: attempt.id }, data: { createdAt: submittedAt } });
    }
  }
  // 재시험 일부에 보강 일정
  const tasks = await prisma.retakeTask.findMany({ where: { student: { academyId }, status: "pending" }, orderBy: { createdAt: "desc" }, take: 4 });
  const nextThu = new Date(thisWeekStart + 3 * 86400e3 + 19 * 3600e3 - offset + 9 * 3600e3);
  for (const [i, t] of tasks.entries()) await prisma.retakeTask.update({ where: { id: t.id }, data: { scheduledAt: new Date(nextThu.getTime() + (i % 2) * 86400e3), note: i % 2 ? "2층 자습실" : "3층 강의실" } });
  console.log("history seeded: 8 weeks");
}

/** 번호형 모의고사 단어장 PDF 를 실제 파서로 읽어 단어장으로 저장 (fixtures/mock-exam-numbered.pdf). 이미 있으면 건너뜀 */
async function seedNumberedBook(academyId: string, createdById: string) {
  const fs = await import("fs");
  const path = await import("path");
  const file = path.join(process.cwd(), "fixtures", "mock-exam-numbered.pdf");
  if (!fs.existsSync(file)) return;
  const exists = await prisma.import.findFirst({ where: { academyId, fileName: "다이제보카_2026년9월_고1_모의고사_단어장.pdf" } });
  if (exists) return;
  const { extractDocument } = await import("../src/lib/parsers");
  const { saveRowsToBook } = await import("../src/lib/job-handlers");
  const buf = fs.readFileSync(file);
  const { result } = await extractDocument(buf, "mock.pdf");
  const saved = await saveRowsToBook({ academyId, createdById, bookId: null, title: "다이제보카 2026년 9월 고1 모의고사 단어장", rows: result.rows });
  const imp = await prisma.import.create({
    data: { academyId, bookId: saved.bookId, createdById, fileName: "다이제보카_2026년9월_고1_모의고사_단어장.pdf", fileType: "pdf", filePath: "seed", fileSize: buf.length, sha256: "seed", status: "approved", meta: JSON.stringify({ ...result.meta, words: saved.created, days: saved.days, dayMode: saved.mode, sections: new Set(result.rows.map((r) => r.section)).size, docDayRows: 0 }) },
  });
  await prisma.importRow.createMany({ data: result.rows.map((r, i) => ({ importId: imp.id, seq: i + 1, dayLabel: r.dayLabel, dayNo: r.dayNo, english: r.english, pos: r.pos, meaning: r.meaning, synonyms: r.synonyms, section: r.section, source: r.source, status: "approved" })) });
  console.log(`numbered book seeded: ${saved.created} words, ${saved.days} days`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
