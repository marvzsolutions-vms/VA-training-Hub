-- V2.20 Course Import Engine
create table if not exists public.course_import_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('quiz','assignment')),
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.course_import_assessments enable row level security;
drop policy if exists course_import_assessments_staff_read on public.course_import_assessments;
create policy course_import_assessments_staff_read on public.course_import_assessments for select to authenticated using (public.is_staff());
drop policy if exists course_import_assessments_owner_manage on public.course_import_assessments;
create policy course_import_assessments_owner_manage on public.course_import_assessments for all to authenticated using (public.is_owner()) with check (public.is_owner());

create or replace function public.import_course_package(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cid uuid; mid uuid; lid uuid; item jsonb; r jsonb; i int := 0;
  module_ids jsonb := '{}'::jsonb; lesson_ids jsonb := '{}'::jsonb;
  lvl learning_level;
begin
  if auth.uid() is null or not public.is_owner() then raise exception 'Owner access required'; end if;
  if coalesce(payload->>'slug','') = '' or coalesce(payload->>'title','') = '' then raise exception 'Course slug and title are required'; end if;
  if exists(select 1 from public.courses where slug = payload->>'slug' and deleted_at is null) then raise exception 'A course with this slug already exists'; end if;
  lvl := coalesce((payload->>'level')::learning_level, 'level_1');
  insert into public.courses(slug,title,description,level,learning_outcomes,estimated_minutes,is_published,sort_order,created_by)
  values(payload->>'slug',payload->>'title',coalesce(payload->>'description',''),lvl,
    coalesce(array(select jsonb_array_elements_text(coalesce(payload->'learningOutcomes','[]'::jsonb))), '{}'),
    coalesce((payload->>'estimatedMinutes')::int,0),coalesce((payload->>'published')::boolean,false),
    coalesce((select max(sort_order)+1 from public.courses),1),auth.uid()) returning id into cid;

  for item in select * from jsonb_array_elements(coalesce(payload->'modules','[]'::jsonb)) loop
    insert into public.modules(course_id,title,description,sort_order,level,is_published)
    values(cid,item->>'title',coalesce(item->>'description',''),coalesce((item->>'sortOrder')::int,0),lvl,coalesce((item->>'published')::boolean,true)) returning id into mid;
    module_ids := module_ids || jsonb_build_object(item->>'key',mid);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'lessons','[]'::jsonb)) loop
    mid := (module_ids->> (item->>'moduleKey'))::uuid;
    if mid is null then raise exception 'Lesson references an unknown module: %', item->>'title'; end if;
    insert into public.lessons(module_id,course_id,title,description,objective,student_content,estimated_minutes,type,is_required,sort_order,level,required_student_level,is_published,recording_url)
    values(mid,cid,item->>'title',coalesce(item->>'objective',''),coalesce(item->>'objective',''),coalesce(item->>'studentContent',''),
      coalesce((item->>'estimatedMinutes')::int,15),coalesce((item->>'type')::lesson_type,'text'),coalesce((item->>'required')::boolean,true),
      coalesce((item->>'sortOrder')::int,0),lvl,lvl,coalesce((item->>'published')::boolean,true),nullif(item->>'recordingUrl','')) returning id into lid;
    lesson_ids := lesson_ids || jsonb_build_object(item->>'key',lid);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(payload->'resources','[]'::jsonb)) loop
    mid := null; lid := null;
    if nullif(r->>'moduleKey','') is not null then mid := (module_ids->>(r->>'moduleKey'))::uuid; end if;
    if nullif(r->>'lessonKey','') is not null then lid := (lesson_ids->>(r->>'lessonKey'))::uuid; end if;
    insert into public.resources(title,description,url,file_path,course_id,module_id,lesson_id,level,sort_order,visibility,added_by)
    values(r->>'title',coalesce(r->>'description',''),nullif(r->>'url',''),nullif(r->>'filePath',''),cid,mid,lid,lvl,coalesce((r->>'sortOrder')::int,0),'enrolled',auth.uid());
  end loop;

  i := 0;
  for item in select * from jsonb_array_elements(coalesce(payload->'quizzes','[]'::jsonb)) loop
    i := i + 1; insert into public.course_import_assessments(course_id,assessment_type,title,payload,sort_order)
    values(cid,'quiz',coalesce(item->>'title','Quiz'),item,i);
  end loop;
  i := 0;
  for item in select * from jsonb_array_elements(coalesce(payload->'assignments','[]'::jsonb)) loop
    i := i + 1; insert into public.course_import_assessments(course_id,assessment_type,title,payload,sort_order)
    values(cid,'assignment',coalesce(item->>'title','Assignment'),item,i);
  end loop;

  return jsonb_build_object('course_id',cid,'modules',jsonb_array_length(coalesce(payload->'modules','[]'::jsonb)),'lessons',jsonb_array_length(coalesce(payload->'lessons','[]'::jsonb)));
end $$;
revoke all on function public.import_course_package(jsonb) from public, anon;
grant execute on function public.import_course_package(jsonb) to authenticated;
