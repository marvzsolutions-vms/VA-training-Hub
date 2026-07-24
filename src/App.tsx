import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { RedirectIfAuthed, RequireAuth, RequireRole } from './routes/guards'
import AppShell from './components/layout/AppShell'

import LoginPage from './pages/auth/LoginPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SetupRequiredPage from './pages/auth/SetupRequiredPage'

import DashboardPage from './pages/DashboardPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'
import LessonPage from './pages/LessonPage'
import QuizPage from './pages/QuizPage'
import PresentationPage from './pages/PresentationPage'
import CoursePresentationPage from './pages/CoursePresentationPage'
import ToolsPage from './pages/ToolsPage'
import ResourcesPage from './pages/ResourcesPage'
import QuestionsPage from './pages/QuestionsPage'
import SessionsPage from './pages/SessionsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import UpgradeRequestsPage from './pages/UpgradeRequestsPage'

import StudentsPage from './pages/staff/StudentsPage'
import StudentDetailPage from './pages/staff/StudentDetailPage'
import BuilderPage from './pages/staff/BuilderPage'
import LessonEditorPage from './pages/staff/LessonEditorPage'
import AccessPage from './pages/staff/AccessPage'
import BatchesPage from './pages/staff/BatchesPage'
import EnrollmentsPage from './pages/staff/EnrollmentsPage'
import UsersPage from './pages/staff/UsersPage'
import RolesPage from './pages/staff/RolesPage'
import BrandingPage from './pages/staff/BrandingPage'
import SystemSettingsPage from './pages/staff/SystemSettingsPage'
import AuditLogsPage from './pages/staff/AuditLogsPage'
import ApplicationFormsPage from './pages/staff/ApplicationFormsPage'
import PublicApplicationFormPage from './pages/PublicApplicationFormPage'

import AccessDeniedPage from './pages/shared/AccessDeniedPage'
import NotFoundPage from './pages/shared/NotFoundPage'
import { PrivacyPage, TermsPage } from './pages/shared/LegalPages'

export default function App() {
  const { configured } = useAuth()
  if (!configured) return <SetupRequiredPage />

  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="/apply/:slug" element={<PublicApplicationFormPage />} />

      {/* Presentation mode runs full screen, outside the shell. */}
      <Route
        path="/present/course/:courseId"
        element={
          <RequireAuth>
            <RequireRole roles={['coach', 'manager', 'owner']}>
              <CoursePresentationPage />
            </RequireRole>
          </RequireAuth>
        }
      />

      <Route
        path="/present/:lessonId"
        element={
          <RequireAuth>
            <RequireRole roles={['coach', 'manager', 'owner']}>
              <PresentationPage />
            </RequireRole>
          </RequireAuth>
        }
      />

      <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:slug" element={<CourseDetailPage />} />
        <Route path="lessons/:lessonId" element={<LessonPage />} />
        <Route path="quizzes/:quizId" element={<QuizPage />} />
        <Route path="tools" element={<ToolsPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="upgrades" element={<UpgradeRequestsPage />} />

        <Route path="students" element={
          <RequireRole roles={['coach', 'manager', 'owner']}><StudentsPage /></RequireRole>} />
        <Route path="students/:studentId" element={
          <RequireRole roles={['coach', 'manager', 'owner']}><StudentDetailPage /></RequireRole>} />
        <Route path="builder" element={
          <RequireRole roles={['coach', 'manager', 'owner']}><BuilderPage /></RequireRole>} />
        <Route path="builder/lessons/:lessonId" element={
          <RequireRole roles={['coach', 'manager', 'owner']}><LessonEditorPage /></RequireRole>} />

        <Route path="access" element={
          <RequireRole roles={['manager', 'owner']}><AccessPage /></RequireRole>} />
        <Route path="batches" element={
          <RequireRole roles={['manager', 'owner']}><BatchesPage /></RequireRole>} />
        <Route path="enrollments" element={
          <RequireRole roles={['manager', 'owner']}><EnrollmentsPage /></RequireRole>} />

        <Route path="users" element={<RequireRole roles={['owner']}><UsersPage /></RequireRole>} />
        <Route path="roles" element={<RequireRole roles={['owner']}><RolesPage /></RequireRole>} />
        <Route path="branding" element={<RequireRole roles={['owner']}><BrandingPage /></RequireRole>} />
        <Route path="system" element={<RequireRole roles={['owner']}><SystemSettingsPage /></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={['owner']}><AuditLogsPage /></RequireRole>} />
        <Route path="application-form" element={<RequireRole roles={['owner']}><ApplicationFormsPage /></RequireRole>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
