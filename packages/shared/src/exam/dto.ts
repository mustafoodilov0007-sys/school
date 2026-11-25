/** O'quvchi API'si DTO lari (to'g'ri javob belgilari YO'Q). */
export interface AttemptDto {
  id: string;
  examId: string;
  status: string;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  /** Ekranda o'quvchi nomi/ID suv belgisi ko'rsatilsinmi */
  watermark: boolean;
  /** Sahifadan chiqish/qaytish hodisalari serverga yuborilsinmi */
  trackEvents: boolean;
  /** Imtihon PDF varag'i (bor bo'lsa) — mediaId; fayl /api/student/media/:id dan olinadi */
  pdfMediaId: string | null;
  allowCalculator: boolean;
  allowFormulaSheet: boolean;
  focusWarnThreshold: number;
  questions: AttemptQuestionDto[];
}

export interface AttemptQuestionDto {
  id: string; // attempt_question_id
  position: number;
  type: string;
  body: string;
  imageMediaId: string | null;
  points: number;
  options: { id: string; body: string }[];
  answer: { selectedOptionIds: string[]; numericValue: number | null; isFlagged: boolean; version: number } | null;
}

export interface StudentExamDto {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  questionCount: number | null;
  canStart: boolean;
  activeAttemptId: string | null;
  attemptsUsed: number;
}


export interface StudentResultDto {
  examId: string;
  title: string;
  attemptId: string;
  attemptNo: number;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  submittedAt: string;
  /** Faqat imtihonda reyting yoqilgan bo'lsa: o'rin va jami (boshqa o'quvchilar ma'lumoti berilmaydi) */
  rank: number | null;
  rankTotal: number | null;
}

export interface StudentAnalyticsDto {
  history: { title: string; percent: number; submittedAt: string }[];
  topics: { topic: string; earned: number; total: number; percent: number }[];
}

export interface ReviewQuestion {
  /** attempt_question id (shikoyat uchun) */
  id: string;
  imageMediaId: string | null;
  position: number;
  type: string;
  body: string;
  points: number;
  pointsAwarded: number | null;
  voided: boolean;
  isCorrect: boolean | null;
  explanation: string | null;
  options: { id: string; body: string; selected: boolean; correct: boolean }[];
  numeric: { yours: number | null; expected: number } | null;
}
