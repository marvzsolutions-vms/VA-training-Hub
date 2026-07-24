import { supabase } from './supabase'

export type OwnerDeleteTarget = 'question' | 'question_reply' | 'announcement' | 'resource' | 'upgrade_request' | 'lesson' | 'module' | 'course'

export async function ownerDeleteRecord(targetType: OwnerDeleteTarget, targetId: string) {
  const { error } = await supabase.rpc('owner_delete_record', { target_type: targetType, target_id: targetId })
  if (error) throw error
}
