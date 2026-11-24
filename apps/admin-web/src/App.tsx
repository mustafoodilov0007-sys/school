import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { AuditPage } from './pages/Audit';
import { AuthCallback, Login } from './pages/Login';
import { AttendancePage, JournalPage, SchedulePage } from './pages/School';
import { ParentsPage, TeachersPage } from './pages/People';
import { Landing } from './pages/Landing';
import { ClassesPage } from './pages/Classes';
import { Dashboard } from './pages/Dashboard';
import { ExamResultsPage } from './pages/ExamResults';
import { ExamsPage } from './pages/Exams';
import { QuestionsPage } from './pages/Questions';
import { StudentsPage } from './pages/Students';
import { ComplaintsPage } from './pages/Complaints';
import { MaterialsPage } from './pages/Materials';
import { MessagesPage } from './pages/Messages';
import { ReportsPage } from './pages/Reports';

const NAV: { group: string; adminOnly?: boolean; teacherOk?: boolean; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  { group: 'Asosiy', teacherOk: true, items: [{ to: '/', label: 'Bosh sahifa', icon: '🏠', end: true }] },
  { group: "O'quv jarayoni", items: [
    { to: '/exams', label: 'Imtihonlar', icon: '📝' },
    { to: '/questions', label: 'Savollar banki', icon: '❓' },
    { to: '/materials', label: 'Materiallar', icon: '📚' },
  ] },
  { group: 'Maktab', teacherOk: true, items: [
    { to: '/journal', label: 'Elektron jurnal', icon: '📒' },
    { to: '/attendance', label: 'Davomat', icon: '✅' },
    { to: '/schedule', label: 'Dars jadvali', icon: '🗓️' },
  ] },
  { group: "O'quvchilar", items: [
    { to: '/classes', label: 'Sinflar', icon: '🏫' },
    { to: '/students', label: "O'quvchilar", icon: '🎓' },
  ] },
  { group: 'Natija va aloqa', items: [
    { to: '/reports', label: 'Hisobotlar', icon: '📊' },
    { to: '/messages', label: 'Xabar yuborish', icon: '✉️' },
    { to: '/complaints', label: 'Shikoyatlar', icon: '💬' },
  ] },
  { group: 'Foydalanuvchilar', adminOnly: true, items: [
    { to: '/teachers', label: "O'qituvchilar", icon: '👨‍🏫' },
    { to: '/parents', label: 'Ota-onalar', icon: '👪' },
  ] },
  { group: 'Tizim', items: [{ to: '/audit', label: 'Harakatlar tarixi', icon: '🕓' }] },
];

export function App() {
  const { loading, admin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={admin ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          loading ? <Spinner /> : !admin ? <Navigate to="/welcome" replace /> : (
            <div className="min-h-screen md:flex">
              <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
                <div className="font-bold">Physics Exam Pro</div>
                <button className="btn-sm" aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen((v) => !v)}>
                  {menuOpen ? 'Yopish' : 'Menyu'}
                </button>
              </header>
              <aside id="admin-nav" className={`${menuOpen ? 'block' : 'hidden'} w-full shrink-0 border-r border-line bg-card p-4 md:sticky md:top-0 md:block md:h-screen md:w-60 md:overflow-y-auto`}>
                <div className="mb-1 hidden text-lg font-bold md:block">⚛️ Physics Exam Pro</div>
                <div className="mb-5 hidden text-xs text-mute md:block">{admin.displayName ?? ''} · {admin.role === 'admin' ? 'Administrator' : "O'qituvchi"}</div>
                <nav aria-label="Asosiy" className="space-y-4">
                  {NAV.filter((g) => (admin.role === 'admin' ? true : g.teacherOk)).map((g) => (
                    <div key={g.group}>
                      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-mute">{g.group}</div>
                      {g.items.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                          className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-brand font-semibold text-brand-ink' : 'hover:bg-bg'}`}>
                          <span aria-hidden="true">{n.icon}</span>{n.label}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </nav>
                <button className="btn-sm mt-6 w-full justify-center" onClick={() => void logout()}>Chiqish</button>
              </aside>
              <main className="mx-auto min-w-0 max-w-6xl flex-1 p-4 md:p-6">
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="journal" element={<JournalPage />} />
                  <Route path="attendance" element={<AttendancePage />} />
                  <Route path="schedule" element={<SchedulePage />} />
                  <Route path="teachers" element={<TeachersPage />} />
                  <Route path="parents" element={<ParentsPage />} />
                  <Route path="classes" element={<ClassesPage />} />
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="questions" element={<QuestionsPage />} />
                  <Route path="exams" element={<ExamsPage />} />
                  <Route path="exams/:id/results" element={<ExamResultsPage />} />
                  <Route path="materials" element={<MaterialsPage />} />
                  <Route path="complaints" element={<ComplaintsPage />} />
                  <Route path="messages" element={<MessagesPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          )
        }
      />
    </Routes>
  );
}
