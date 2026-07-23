import { supabase } from './supabase'

export async function uploadAcademyMedia(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safe = `${crypto.randomUUID()}.${ext}`
  const path = `${folder}/${safe}`
  const { error } = await supabase.storage.from('academy-media').upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('academy-media').getPublicUrl(path)
  return data.publicUrl
}
