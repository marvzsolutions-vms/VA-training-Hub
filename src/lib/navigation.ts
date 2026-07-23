import {
  LayoutDashboard, BookOpen, Wrench, FolderOpen, MessageCircleQuestion, Video,
  Megaphone, Bell, UserRound, Settings, Users, GraduationCap, ShieldCheck,
  Layers, KeyRound, Palette, ScrollText, ClipboardList, ArrowUpCircle, FileQuestion,
} from 'lucide-react'
import type { AppRole } from './types'

export interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  roles: AppRole[]
  group: 'Learning' | 'Teaching' | 'Administration' | 'Account'
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning', end: true },
  { label: 'My courses', to: '/courses', icon: BookOpen, roles: ['student'], group: 'Learning' },
  { label: 'My level', to: '/upgrades', icon: ArrowUpCircle, roles: ['student'], group: 'Learning' },
  { label: 'Upgrade requests', to: '/upgrades', icon: ArrowUpCircle, roles: ['coach', 'manager', 'owner'], group: 'Teaching' },
  { label: 'Courses', to: '/courses', icon: BookOpen, roles: ['coach', 'manager', 'owner'], group: 'Teaching' },
  { label: 'Tools', to: '/tools', icon: Wrench, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning' },
  { label: 'Resources', to: '/resources', icon: FolderOpen, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning' },
  { label: 'Questions', to: '/questions', icon: MessageCircleQuestion, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning' },
  { label: 'Zoom sessions', to: '/sessions', icon: Video, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning' },
  { label: 'Announcements', to: '/announcements', icon: Megaphone, roles: ['student', 'coach', 'manager', 'owner'], group: 'Learning' },

  { label: 'Students', to: '/students', icon: GraduationCap, roles: ['coach', 'manager', 'owner'], group: 'Teaching' },
  { label: 'Course builder', to: '/builder', icon: ClipboardList, roles: ['coach', 'manager', 'owner'], group: 'Teaching' },

  { label: 'Student access', to: '/access', icon: ShieldCheck, roles: ['manager', 'owner'], group: 'Administration' },
  { label: 'Batches', to: '/batches', icon: Layers, roles: ['manager', 'owner'], group: 'Administration' },
  { label: 'Enrolments', to: '/enrollments', icon: BookOpen, roles: ['manager', 'owner'], group: 'Administration' },
  { label: 'Users', to: '/users', icon: Users, roles: ['owner'], group: 'Administration' },
  { label: 'Roles and permissions', to: '/roles', icon: KeyRound, roles: ['owner'], group: 'Administration' },
  { label: 'Branding', to: '/branding', icon: Palette, roles: ['owner'], group: 'Administration' },
  { label: 'System settings', to: '/system', icon: Settings, roles: ['owner'], group: 'Administration' },
  { label: 'Application form', to: '/application-form', icon: FileQuestion, roles: ['owner'], group: 'Administration' },
  { label: 'Audit logs', to: '/audit', icon: ScrollText, roles: ['owner'], group: 'Administration' },

  { label: 'Notifications', to: '/notifications', icon: Bell, roles: ['student', 'coach', 'manager', 'owner'], group: 'Account' },
  { label: 'Profile', to: '/profile', icon: UserRound, roles: ['student', 'coach', 'manager', 'owner'], group: 'Account' },
  { label: 'Settings', to: '/settings', icon: Settings, roles: ['student', 'coach', 'manager', 'owner'], group: 'Account' },
]

export function navForRole(role: AppRole): NavItem[] {
  const seen = new Set<string>()
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false
    const key = `${item.to}-${item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const NAV_GROUP_ORDER: NavItem['group'][] = ['Learning', 'Teaching', 'Administration', 'Account']
