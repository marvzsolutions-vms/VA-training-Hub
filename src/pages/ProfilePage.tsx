import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { uploadAcademyMedia } from '../lib/media'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Badge, Button, Card, Input, PageHeader, SectionHeading, Select, Textarea,
} from '../components/ui'
import { formatDate, initials, LEVEL_LABEL, readableError, ROLE_LABEL, STATUS_LABEL } from '../lib/utils'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  mobile_number: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  time_zone: z.string().min(1, 'Choose a time zone'),
})
type ProfileValues = z.infer<typeof profileSchema>

const studentSchema = z.object({
  experience_level: z.string(),
  employment_status: z.string(),
  availability: z.string(),
  introduction: z.string().max(800, 'Keep your introduction under 800 characters'),
  skills: z.string(),
  familiar_tools: z.string(),
  resume_url: z.string().url('Enter a full URL').or(z.literal('')),
  portfolio_url: z.string().url('Enter a full URL').or(z.literal('')),
  linkedin_url: z.string().url('Enter a full URL').or(z.literal('')),
})
type StudentValues = z.infer<typeof studentSchema>

export default function ProfilePage() {
  const { profile, student, refresh, theme, setTheme } = useAuth()
  const { notify } = useToast()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingStudent, setSavingStudent] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      mobile_number: profile?.mobile_number ?? '',
      city: profile?.city ?? '',
      province: profile?.province ?? '',
      time_zone: profile?.time_zone ?? 'Asia/Manila',
    },
  })

  const studentForm = useForm<StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      experience_level: student?.experience_level ?? 'none',
      employment_status: student?.employment_status ?? 'looking',
      availability: student?.availability ?? 'full_time',
      introduction: student?.introduction ?? '',
      skills: (student?.skills ?? []).join(', '),
      familiar_tools: (student?.familiar_tools ?? []).join(', '),
      resume_url: student?.resume_url ?? '',
      portfolio_url: student?.portfolio_url ?? '',
      linkedin_url: student?.linkedin_url ?? '',
    },
  })


  const setAvatar = async (url: string, choice: 'coach_female' | 'coach_male' | 'coach_neutral' | 'student_female' | 'student_male' | 'student_neutral' | 'custom') => {
    if (!profile) return
    try {
      const { error } = await supabase.from('profiles').update({ avatar_url: url, avatar_choice: choice }).eq('id', profile.id)
      if (error) throw error
      await refresh(); notify('Profile picture updated.')
    } catch (error) { notify(readableError(error), 'error') }
  }

  const uploadAvatar = async (file?: File) => {
    if (!file) return
    setUploadingAvatar(true)
    try { await setAvatar(await uploadAcademyMedia(file, 'avatars'), 'custom') }
    catch (error) { notify(readableError(error), 'error') }
    finally { setUploadingAvatar(false) }
  }

  const saveProfile = async (values: ProfileValues) => {
    if (!profile) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: values.full_name.trim(),
        mobile_number: values.mobile_number || null,
        city: values.city || null,
        province: values.province || null,
        time_zone: values.time_zone,
      }).eq('id', profile.id)
      if (error) throw error
      await refresh()
      notify('Profile saved.')
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveStudent = async (values: StudentValues) => {
    if (!profile) return
    setSavingStudent(true)
    try {
      const { error } = await supabase.from('student_profiles').update({
        experience_level: values.experience_level,
        employment_status: values.employment_status,
        availability: values.availability,
        introduction: values.introduction,
        skills: values.skills.split(',').map((s) => s.trim()).filter(Boolean),
        familiar_tools: values.familiar_tools.split(',').map((s) => s.trim()).filter(Boolean),
        resume_url: values.resume_url || null,
        portfolio_url: values.portfolio_url || null,
        linkedin_url: values.linkedin_url || null,
      }).eq('user_id', profile.id)
      if (error) throw error
      await refresh()
      notify('Learning profile saved.')
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSavingStudent(false)
    }
  }

  if (!profile) return null

  return (
    <>
      <PageHeader title="Your profile"
        description="Clients and coaches see this information. Keep it accurate." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="Profile" className="h-16 w-16 rounded-2xl object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-lg font-bold text-brand-800">{initials(profile.full_name || profile.email)}</span>}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{profile.full_name}</h2>
            <p className="text-sm text-ink-muted">{profile.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand">{ROLE_LABEL[profile.role]}</Badge>
              {student && <Badge tone="info">{LEVEL_LABEL[student.current_level]}</Badge>}
              {student && <Badge tone="neutral">{STATUS_LABEL[student.access_status]}</Badge>}
              <Badge tone="neutral">Joined {formatDate(profile.created_at)}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <SectionHeading title="Profile picture" description="Choose a professional chibi avatar or upload your own photo." />
      <Card className="mb-8">
        <p className="mb-4 text-sm font-semibold text-brand-700">{profile.role === 'student' ? 'Student avatars' : 'Coach and staff avatars'}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(profile.role === 'student'
            ? [
                ['/avatars/student-girl.png','student_female','Student — Girl'],
                ['/avatars/student-boy.png','student_male','Student — Boy'],
              ]
            : [
                ['/avatars/coach-female.png','coach_female','Coach — Female'],
                ['/avatars/coach-male.png','coach_male','Coach — Male'],
              ]
          ).map(([url,choice,label]) => {
            const selected = profile.avatar_choice === choice
            return <button key={choice} type="button" onClick={() => setAvatar(url, choice as Parameters<typeof setAvatar>[1])} className={`rounded-2xl border p-3 text-center transition ${selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-canvas-line hover:border-brand-300'}`}>
              <img src={url} alt={label} className="mx-auto h-40 w-40 object-contain" />
              <span className="mt-2 block text-xs font-medium text-ink">{label}</span>
              <span className={`mx-auto mt-2 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-canvas-line'}`}>{selected ? '✓' : ''}</span>
            </button>
          })}
          <label className="flex min-h-[218px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-brand-300 bg-brand-50 px-5 text-center text-sm font-medium text-brand-700">
            <span className="text-2xl">⇧</span>
            {uploadingAvatar ? 'Uploading...' : 'Upload your own photo'}
            <span className="mt-1 text-xs font-normal text-ink-soft">JPG, PNG or WebP</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
        </div>
      </Card>

      <SectionHeading title="Appearance" description="Choose how the academy looks for your account. Only Light and Dark modes are available." />
      <Card className="mb-8">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['light', 'dark'] as const).map((mode) => (
            <button key={mode} type="button" onClick={async () => {
              try { await setTheme(mode); notify(`${mode === 'light' ? 'Light' : 'Dark'} mode selected.`) }
              catch (error) { notify(readableError(error), 'error') }
            }} className={`theme-choice-card rounded-2xl border p-5 text-left transition ${theme === mode ? 'theme-choice-selected border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-canvas-line bg-canvas-card hover:border-brand-300'}`}>
              <span className="block text-sm font-semibold text-ink">{mode === 'light' ? 'Light mode' : 'Dark mode'}</span>
              <span className="mt-1 block text-xs text-ink-soft">{mode === 'light' ? 'Bright, clean module background.' : 'Dark module background with light text.'}</span>
            </button>
          ))}
        </div>
      </Card>

      <form onSubmit={profileForm.handleSubmit(saveProfile)} className="mb-8" noValidate>
        <SectionHeading title="Personal details" />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" required error={profileForm.formState.errors.full_name?.message}
              {...profileForm.register('full_name')} />
            <Input label="Email address" value={profile.email} disabled
              hint="Ask a Manager if this needs to change." />
            <Input label="Mobile number" placeholder="+63 917 000 0000"
              {...profileForm.register('mobile_number')} />
            <Input label="City" {...profileForm.register('city')} />
            <Input label="Province" {...profileForm.register('province')} />
            <Select label="Time zone" {...profileForm.register('time_zone')}>
              <option value="Asia/Manila">Asia/Manila (PHT)</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
            </Select>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={savingProfile}>Save changes</Button>
          </div>
        </Card>
      </form>

      {student && (
        <form onSubmit={studentForm.handleSubmit(saveStudent)} noValidate>
          <SectionHeading title="Learning profile"
            description="Your level and access are set by your Manager, not here." />
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Experience level" {...studentForm.register('experience_level')}>
                <option value="none">No VA experience yet</option>
                <option value="some">Some related experience</option>
                <option value="experienced">Working as a VA already</option>
              </Select>
              <Select label="Employment status" {...studentForm.register('employment_status')}>
                <option value="looking">Looking for work</option>
                <option value="employed">Employed elsewhere</option>
                <option value="freelancing">Freelancing</option>
                <option value="student">Studying</option>
              </Select>
              <Select label="Availability" {...studentForm.register('availability')}>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="evenings">Evenings only</option>
                <option value="flexible">Flexible</option>
              </Select>
              <Input label="Skills" hint="Separate with commas." {...studentForm.register('skills')} />
              <Input label="Tools you know" hint="Separate with commas."
                {...studentForm.register('familiar_tools')} />
              <Input label="Resume link" type="url"
                error={studentForm.formState.errors.resume_url?.message}
                {...studentForm.register('resume_url')} />
              <Input label="Portfolio link" type="url"
                error={studentForm.formState.errors.portfolio_url?.message}
                {...studentForm.register('portfolio_url')} />
              <Input label="LinkedIn profile" type="url"
                error={studentForm.formState.errors.linkedin_url?.message}
                {...studentForm.register('linkedin_url')} />
              <div className="sm:col-span-2">
                <Textarea label="Introduction"
                  hint="Two or three sentences a client could read."
                  error={studentForm.formState.errors.introduction?.message}
                  {...studentForm.register('introduction')} />
              </div>
            </div>

            <dl className="mt-6 grid gap-3 border-t border-canvas-line pt-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Current level</dt>
                <dd className="font-medium text-ink">{LEVEL_LABEL[student.current_level]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Access status</dt>
                <dd className="font-medium text-ink">{STATUS_LABEL[student.access_status]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Level progress</dt>
                <dd className="font-medium text-ink">{Math.round(student.level_progress)}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Date joined</dt>
                <dd className="font-medium text-ink">{formatDate(student.joined_at)}</dd>
              </div>
            </dl>

            <div className="mt-5 flex justify-end">
              <Button type="submit" loading={savingStudent}>Save learning profile</Button>
            </div>
          </Card>
        </form>
      )}
    </>
  )
}
