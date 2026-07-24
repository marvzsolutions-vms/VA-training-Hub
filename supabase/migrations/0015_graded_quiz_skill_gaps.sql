-- V2.21 Graded quizzes and deterministic skill-gap recommendations

alter table public.lessons add column if not exists source_slug text;
create unique index if not exists idx_lessons_course_source_slug
  on public.lessons(course_id, source_slug) where source_slug is not null;

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete set null,
  title text not null,
  description text not null default '',
  passing_percentage numeric(5,2) not null default 80 check (passing_percentage between 0 and 100),
  maximum_attempts int not null default 3 check (maximum_attempts > 0),
  allow_retake boolean not null default true,
  show_correct_answers boolean not null default true,
  required_for_completion boolean not null default true,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice','true_false')),
  explanation text not null default '',
  skill_tag text not null default 'general',
  related_lesson_id uuid references public.lessons(id) on delete set null,
  related_lesson_slug text,
  points numeric(8,2) not null default 1 check (points > 0),
  is_required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  choice_text text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0
);
create unique index if not exists one_correct_choice_per_question
  on public.quiz_choices(question_id) where is_correct;

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number int not null,
  points_earned numeric(10,2) not null default 0,
  total_points numeric(10,2) not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean not null default false,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(quiz_id, student_id, attempt_number)
);

create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_choice_id uuid references public.quiz_choices(id) on delete set null,
  is_correct boolean not null default false,
  points_earned numeric(8,2) not null default 0,
  unique(attempt_id, question_id)
);

create table if not exists public.course_results (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  overall_percentage numeric(5,2) not null default 0,
  passed boolean not null default false,
  completed_at timestamptz,
  weak_skills jsonb not null default '[]'::jsonb,
  recommended_lessons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique(course_id, student_id)
);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_choices enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.course_results enable row level security;

-- Metadata can be seen by users with course access. Correct choices are never selected directly by students.
drop policy if exists quizzes_access_read on public.quizzes;
create policy quizzes_access_read on public.quizzes for select to authenticated
  using (public.is_staff() or (is_published and public.can_access_course(course_id)));
drop policy if exists quizzes_owner_manage on public.quizzes;
create policy quizzes_owner_manage on public.quizzes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists quiz_questions_staff_read on public.quiz_questions;
create policy quiz_questions_staff_read on public.quiz_questions for select to authenticated using (public.is_staff());
drop policy if exists quiz_questions_owner_manage on public.quiz_questions;
create policy quiz_questions_owner_manage on public.quiz_questions for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists quiz_choices_staff_read on public.quiz_choices;
create policy quiz_choices_staff_read on public.quiz_choices for select to authenticated using (public.is_staff());
drop policy if exists quiz_choices_owner_manage on public.quiz_choices;
create policy quiz_choices_owner_manage on public.quiz_choices for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists quiz_attempts_own_or_staff on public.quiz_attempts;
create policy quiz_attempts_own_or_staff on public.quiz_attempts for select to authenticated
  using (student_id = auth.uid() or public.is_staff());
drop policy if exists quiz_answers_own_or_staff on public.quiz_attempt_answers;
create policy quiz_answers_own_or_staff on public.quiz_attempt_answers for select to authenticated
  using (exists(select 1 from public.quiz_attempts a where a.id=attempt_id and (a.student_id=auth.uid() or public.is_staff())));
drop policy if exists course_results_own_or_staff on public.course_results;
create policy course_results_own_or_staff on public.course_results for select to authenticated
  using (student_id = auth.uid() or public.is_staff());

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quizzes%rowtype; n int; aid uuid;
begin
  if auth.uid() is null or public.my_role() <> 'student' then raise exception 'Student access required'; end if;
  select * into q from public.quizzes where id=p_quiz_id and is_published;
  if not found or not public.can_access_course(q.course_id) then raise exception 'Quiz is not available'; end if;
  select id, attempt_number into aid, n from public.quiz_attempts
    where quiz_id=q.id and student_id=auth.uid() and submitted_at is null
    order by started_at desc limit 1;
  if aid is not null then
    return jsonb_build_object('attempt_id',aid,'attempt_number',n,'maximum_attempts',q.maximum_attempts);
  end if;
  select count(*) into n from public.quiz_attempts where quiz_id=q.id and student_id=auth.uid();
  if n >= q.maximum_attempts then raise exception 'Maximum attempts reached'; end if;
  if n > 0 and not q.allow_retake then raise exception 'Retakes are not allowed'; end if;
  insert into public.quiz_attempts(quiz_id,student_id,attempt_number,total_points)
  values(q.id,auth.uid(),n+1,(select coalesce(sum(points),0) from public.quiz_questions where quiz_id=q.id)) returning id into aid;
  return jsonb_build_object('attempt_id',aid,'attempt_number',n+1,'maximum_attempts',q.maximum_attempts);
end $$;

create or replace function public.get_quiz_attempt(p_quiz_id uuid, p_attempt_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quizzes%rowtype; a public.quiz_attempts%rowtype;
begin
  select * into q from public.quizzes where id=p_quiz_id;
  if not found then raise exception 'Quiz not found'; end if;
  if auth.uid() is null or (not public.is_staff() and not public.can_access_course(q.course_id)) then raise exception 'Access denied'; end if;
  if p_attempt_id is not null then
    select * into a from public.quiz_attempts where id=p_attempt_id and quiz_id=q.id;
    if not found or (not public.is_staff() and a.student_id<>auth.uid()) then raise exception 'Attempt not found'; end if;
    if a.submitted_at is not null then return public.get_quiz_result(p_attempt_id); end if;
  end if;
  return jsonb_build_object(
    'quiz',jsonb_build_object('id',q.id,'course_id',q.course_id,'title',q.title,'description',q.description,'passing_percentage',q.passing_percentage,'maximum_attempts',q.maximum_attempts,'allow_retake',q.allow_retake),
    'questions',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',qq.id,'question_text',qq.question_text,'question_type',qq.question_type,'points',qq.points,'required',qq.is_required,'sort_order',qq.sort_order,
      'choices',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'choice_text',c.choice_text,'sort_order',c.sort_order) order by c.sort_order),'[]'::jsonb) from public.quiz_choices c where c.question_id=qq.id)
    ) order by qq.sort_order),'[]'::jsonb) from public.quiz_questions qq where qq.quiz_id=q.id)
  );
end $$;

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.quiz_attempts%rowtype; q public.quizzes%rowtype; ans jsonb; qq public.quiz_questions%rowtype; correct_choice uuid; selected uuid; earned numeric:=0; total numeric:=0; pct numeric:=0; pass boolean;
begin
  select * into a from public.quiz_attempts where id=p_attempt_id for update;
  if not found or a.student_id<>auth.uid() then raise exception 'Attempt not found'; end if;
  if a.submitted_at is not null then raise exception 'Attempt already submitted'; end if;
  select * into q from public.quizzes where id=a.quiz_id;
  for qq in select * from public.quiz_questions where quiz_id=q.id order by sort_order loop
    total:=total+qq.points; selected:=null;
    select nullif(x->>'selected_choice_id','')::uuid into selected from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) x where x->>'question_id'=qq.id::text limit 1;
    if qq.is_required and selected is null then raise exception 'All required questions must be answered'; end if;
    if selected is not null and not exists(select 1 from public.quiz_choices where id=selected and question_id=qq.id) then raise exception 'Invalid answer choice'; end if;
    select id into correct_choice from public.quiz_choices where question_id=qq.id and is_correct limit 1;
    insert into public.quiz_attempt_answers(attempt_id,question_id,selected_choice_id,is_correct,points_earned)
    values(a.id,qq.id,selected,selected=correct_choice,case when selected=correct_choice then qq.points else 0 end);
    if selected=correct_choice then earned:=earned+qq.points; end if;
  end loop;
  pct:=case when total=0 then 0 else round((earned/total)*100,2) end; pass:=pct>=q.passing_percentage;
  update public.quiz_attempts set points_earned=earned,total_points=total,percentage=pct,passed=pass,submitted_at=now() where id=a.id;
  perform public.calculate_course_result(q.course_id,a.student_id);
  return public.get_quiz_result(a.id);
end $$;

create or replace function public.get_quiz_result(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.quiz_attempts%rowtype; q public.quizzes%rowtype;
begin
  select * into a from public.quiz_attempts where id=p_attempt_id;
  if not found or (a.student_id<>auth.uid() and not public.is_staff()) then raise exception 'Result not found'; end if;
  select * into q from public.quizzes where id=a.quiz_id;
  return jsonb_build_object(
    'quiz',jsonb_build_object('id',q.id,'course_id',q.course_id,'title',q.title,'passing_percentage',q.passing_percentage,'maximum_attempts',q.maximum_attempts,'allow_retake',q.allow_retake,'show_correct_answers',q.show_correct_answers),
    'attempt',to_jsonb(a),
    'remaining_attempts',greatest(q.maximum_attempts-a.attempt_number,0),
    'answers',(select coalesce(jsonb_agg(jsonb_build_object(
      'question_id',qq.id,'question_text',qq.question_text,'skill_tag',qq.skill_tag,'explanation',case when q.show_correct_answers then qq.explanation else '' end,
      'related_lesson_id',qq.related_lesson_id,'related_lesson_slug',qq.related_lesson_slug,'selected_choice_id',aa.selected_choice_id,'is_correct',aa.is_correct,'points_earned',aa.points_earned,'points',qq.points,
      'selected_text',(select choice_text from public.quiz_choices where id=aa.selected_choice_id),
      'correct_text',case when q.show_correct_answers then (select choice_text from public.quiz_choices where question_id=qq.id and is_correct limit 1) else null end
    ) order by qq.sort_order),'[]'::jsonb) from public.quiz_attempt_answers aa join public.quiz_questions qq on qq.id=aa.question_id where aa.attempt_id=a.id),
    'weak_skills',(select coalesce(jsonb_agg(x order by (x->>'mistakes')::int desc),'[]'::jsonb) from (
      select jsonb_build_object('skill_tag',qq.skill_tag,'mistakes',count(*),'recommended_lessons',coalesce(jsonb_agg(distinct jsonb_build_object('lesson_id',qq.related_lesson_id,'lesson_slug',qq.related_lesson_slug)) filter(where qq.related_lesson_id is not null or qq.related_lesson_slug is not null),'[]'::jsonb)) x
      from public.quiz_attempt_answers aa join public.quiz_questions qq on qq.id=aa.question_id where aa.attempt_id=a.id and not aa.is_correct group by qq.skill_tag
    ) s)
  );
end $$;

create or replace function public.calculate_course_result(p_course_id uuid, p_student_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare required_lessons int; completed_lessons int; required_quizzes int; passed_quizzes int; avg_score numeric:=0; result_pass boolean; weak jsonb; recs jsonb;
begin
  if p_student_id<>auth.uid() and not public.is_staff() then raise exception 'Access denied'; end if;
  select count(*) into required_lessons from public.lessons where course_id=p_course_id and is_required and is_published and deleted_at is null;
  select count(*) into completed_lessons from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id where lp.course_id=p_course_id and lp.student_id=p_student_id and lp.is_completed and l.is_required;
  select count(*) into required_quizzes from public.quizzes where course_id=p_course_id and required_for_completion and is_published;
  select count(*),coalesce(avg(best),0) into passed_quizzes,avg_score from (
    select q.id,max(a.percentage) best from public.quizzes q join public.quiz_attempts a on a.quiz_id=q.id and a.student_id=p_student_id and a.submitted_at is not null where q.course_id=p_course_id and q.required_for_completion and q.is_published group by q.id having bool_or(a.passed)
  ) s;
  result_pass:=completed_lessons=required_lessons and passed_quizzes=required_quizzes;
  select coalesce(jsonb_agg(jsonb_build_object('skill_tag',skill_tag,'mistakes',mistakes) order by mistakes desc),'[]'::jsonb) into weak from (
    select qq.skill_tag,count(*) mistakes from public.quiz_attempt_answers aa join public.quiz_attempts a on a.id=aa.attempt_id join public.quiz_questions qq on qq.id=aa.question_id join public.quizzes q on q.id=a.quiz_id where q.course_id=p_course_id and a.student_id=p_student_id and a.submitted_at is not null and not aa.is_correct group by qq.skill_tag
  ) w;
  select coalesce(jsonb_agg(distinct jsonb_build_object('lesson_id',qq.related_lesson_id,'lesson_slug',qq.related_lesson_slug)) filter(where qq.related_lesson_id is not null or qq.related_lesson_slug is not null),'[]'::jsonb) into recs from public.quiz_attempt_answers aa join public.quiz_attempts a on a.id=aa.attempt_id join public.quiz_questions qq on qq.id=aa.question_id join public.quizzes q on q.id=a.quiz_id where q.course_id=p_course_id and a.student_id=p_student_id and a.submitted_at is not null and not aa.is_correct;
  insert into public.course_results(course_id,student_id,overall_percentage,passed,completed_at,weak_skills,recommended_lessons,updated_at)
  values(p_course_id,p_student_id,avg_score,result_pass,case when result_pass then now() else null end,weak,recs,now())
  on conflict(course_id,student_id) do update set overall_percentage=excluded.overall_percentage,passed=excluded.passed,completed_at=excluded.completed_at,weak_skills=excluded.weak_skills,recommended_lessons=excluded.recommended_lessons,updated_at=now();
  return jsonb_build_object('course_id',p_course_id,'student_id',p_student_id,'overall_percentage',avg_score,'passed',result_pass,'required_lessons',required_lessons,'completed_lessons',completed_lessons,'required_quizzes',required_quizzes,'passed_quizzes',passed_quizzes,'weak_skills',weak,'recommended_lessons',recs);
end $$;

-- Convert imported quiz payloads to graded quiz records.
create or replace function public.import_graded_quiz_from_payload()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare qid uuid; qitem jsonb; citem jsonb; qn int:=0; cn int; lesson_id uuid; questions jsonb;
begin
  if new.assessment_type<>'quiz' then return new; end if;
  insert into public.quizzes(course_id,title,description,passing_percentage,maximum_attempts,allow_retake,show_correct_answers,required_for_completion,is_published,sort_order,created_by)
  values(new.course_id,coalesce(new.payload->>'title',new.title),coalesce(new.payload->>'description',''),coalesce((new.payload->>'passing_percentage')::numeric,80),coalesce((new.payload->>'maximum_attempts')::int,3),coalesce((new.payload->>'allow_retake')::boolean,true),coalesce((new.payload->>'show_correct_answers')::boolean,true),coalesce((new.payload->>'required_for_completion')::boolean,true),true,new.sort_order,auth.uid()) returning id into qid;
  questions:=case when jsonb_typeof(new.payload->'questions')='array' then new.payload->'questions' when jsonb_typeof(new.payload)='array' then new.payload else '[]'::jsonb end;
  for qitem in select * from jsonb_array_elements(questions) loop
    qn:=qn+1; lesson_id:=null;
    if nullif(qitem->>'related_lesson_slug','') is not null then select id into lesson_id from public.lessons where course_id=new.course_id and source_slug=qitem->>'related_lesson_slug' limit 1; end if;
    insert into public.quiz_questions(quiz_id,question_text,question_type,explanation,skill_tag,related_lesson_id,related_lesson_slug,points,is_required,sort_order)
    values(qid,coalesce(qitem->>'question',qitem->>'question_text'),case when coalesce(qitem->>'type','multiple_choice') in ('true_false','true/false') then 'true_false' else 'multiple_choice' end,coalesce(qitem->>'explanation',''),coalesce(qitem->>'skill_tag','general'),lesson_id,nullif(qitem->>'related_lesson_slug',''),coalesce((qitem->>'points')::numeric,1),coalesce((qitem->>'required')::boolean,true),coalesce((qitem->>'sort_order')::int,qn)) returning id into lesson_id;
    cn:=0;
    for citem in select * from jsonb_array_elements(coalesce(qitem->'choices','[]'::jsonb)) loop
      cn:=cn+1; insert into public.quiz_choices(question_id,choice_text,is_correct,sort_order) values(lesson_id,coalesce(citem->>'text',citem->>'choice_text'),coalesce((citem->>'correct')::boolean,(citem->>'is_correct')::boolean,false),coalesce((citem->>'sort_order')::int,cn));
    end loop;
  end loop;
  return new;
end $$;
drop trigger if exists course_import_assessment_to_graded_quiz on public.course_import_assessments;
create trigger course_import_assessment_to_graded_quiz after insert on public.course_import_assessments for each row execute function public.import_graded_quiz_from_payload();

revoke all on function public.start_quiz_attempt(uuid) from public,anon;
revoke all on function public.get_quiz_attempt(uuid,uuid) from public,anon;
revoke all on function public.submit_quiz_attempt(uuid,jsonb) from public,anon;
revoke all on function public.get_quiz_result(uuid) from public,anon;
revoke all on function public.calculate_course_result(uuid,uuid) from public,anon;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.get_quiz_attempt(uuid,uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid,jsonb) to authenticated;
grant execute on function public.get_quiz_result(uuid) to authenticated;
grant execute on function public.calculate_course_result(uuid,uuid) to authenticated;
