import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/login" className="rounded text-sm font-medium text-brand-700 hover:underline">
          ← Back to sign in
        </Link>
        <div className="card mt-4 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-1 text-xs text-ink-soft">Last updated {updated}</p>
          <div className="mt-6 space-y-5 text-sm leading-6 text-ink-muted">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-base font-semibold text-ink">{heading}</h2>
      {children}
    </section>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy" updated="July 2026">
      <p>
        This policy explains what VA Success Academy stores about you, why, and what you can ask us to change.
        Replace this template with your own reviewed policy before launch.
      </p>
      <Section heading="What we collect">
        <p>
          Your name, email address, contact details, city and province, the courses you are enrolled in,
          your lesson progress, questions you send to coaches, and the files you upload to your profile.
        </p>
      </Section>
      <Section heading="Why we collect it">
        <p>
          To give you access to the right courses, track your progress toward a level, let coaches
          support you, and keep the academy secure.
        </p>
      </Section>
      <Section heading="Who can see it">
        <p>
          Your coach and the academy Managers and Owner. Other students never see your profile,
          progress or questions. Coach-only notes are never shown to students.
        </p>
      </Section>
      <Section heading="How long we keep it">
        <p>
          For as long as your account is active, plus the retention period set by the academy Owner.
          Ask your Manager to delete your account and we will remove your personal data.
        </p>
      </Section>
      <Section heading="Your choices">
        <p>
          You can update your profile at any time, request a copy of your data, or ask for your
          account to be closed. Email the support address shown in your dashboard.
        </p>
      </Section>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of use" updated="July 2026">
      <p>
        These terms cover how you may use VA Success Academy. Replace this template with your own
        reviewed terms before launch.
      </p>
      <Section heading="Your account">
        <p>
          Accounts are personal. Do not share your login. Tell your Manager immediately if you think
          someone else has used your account.
        </p>
      </Section>
      <Section heading="Course materials">
        <p>
          Lessons, templates, recordings and resources are licensed to you for your own learning.
          Do not resell, republish or share them outside the academy.
        </p>
      </Section>
      <Section heading="Levels and access">
        <p>
          Level 2 and Level 3 access is granted by a Manager or Owner. Access may be time-limited,
          and may be withdrawn if these terms are broken.
        </p>
      </Section>
      <Section heading="Client work">
        <p>
          Anything you do for a real client is between you and that client. The academy trains you;
          it is not a party to your client agreements.
        </p>
      </Section>
      <Section heading="Conduct">
        <p>
          Treat coaches and other students respectfully. Accounts used for harassment, cheating or
          sharing paid material may be suspended.
        </p>
      </Section>
    </LegalShell>
  )
}
