-- =====================================================================
-- VA Success Academy — 0005 Curriculum
-- Course titles, descriptions, modules, lesson titles, objectives and
-- durations. Long-form lesson bodies are authored later in the app.
-- =====================================================================

create or replace function public.seed_course(
  p_slug text, p_title text, p_desc text, p_level learning_level,
  p_spec text, p_outcomes text[], p_reqs text[], p_order int,
  p_upgrade boolean, p_published boolean, p_minutes int, p_modules jsonb
) returns uuid language plpgsql as $$
declare
  cid uuid; mid uuid; spec uuid;
  m jsonb; l jsonb; mi int := 0; li int;
begin
  select id into spec from public.specializations where slug = p_spec;

  insert into public.courses (slug, title, description, level, specialization_id,
      learning_outcomes, requirements, estimated_minutes, is_published, sort_order,
      upgrade_required, preview_available)
  values (p_slug, p_title, p_desc, p_level, spec, p_outcomes, p_reqs, p_minutes,
      p_published, p_order, p_upgrade, p_level = 'level_1' and p_order <= 2)
  on conflict (slug) do update set title = excluded.title, description = excluded.description
  returning id into cid;

  delete from public.modules where course_id = cid;

  for m in select * from jsonb_array_elements(p_modules) loop
    mi := mi + 1;
    insert into public.modules (course_id, title, description, sort_order, level)
    values (cid, m->>'t', coalesce(m->>'d',''), mi, p_level)
    returning id into mid;

    li := 0;
    for l in select * from jsonb_array_elements(m->'l') loop
      li := li + 1;
      insert into public.lessons (module_id, course_id, title, objective, description,
          estimated_minutes, type, is_required, sort_order, level, required_student_level,
          required_specialization_id, preview_available,
          student_content, coach_notes, presentation_content, examples, live_activity)
      values (mid, cid, l->>'t', coalesce(l->>'o',''), coalesce(l->>'o',''),
          coalesce((l->>'m')::int, 20), coalesce((l->>'ty')::lesson_type, 'text'),
          coalesce((l->>'req')::boolean, true), li, p_level, p_level,
          case when p_level = 'level_1' then null else spec end,
          p_level = 'level_1' and mi = 1 and li = 1,
          coalesce(l->>'c', ''), coalesce(l->>'n', ''), coalesce(l->>'p', ''),
          coalesce(l->>'e', ''), coalesce(l->>'a', ''));
    end loop;
  end loop;

  return cid;
end $$;

-- ==================== LEVEL 1 — Beginner Foundations ==================
select public.seed_course('virtual-assistant-foundations','Virtual Assistant Foundations',
 'What a Virtual Assistant actually does, how the work is set up, and how to look professional from day one.',
 'level_1', null,
 array['Explain what a VA does and does not do','Set up a professional work environment','Follow a client task from request to delivery'],
 array['A laptop or desktop computer','Stable internet connection'], 1, false, true, 240,
 '[{"t":"Understanding the VA role","d":"What the job is in real terms.","l":[
    {"t":"What a Virtual Assistant really does","o":"Describe the daily work of a VA in plain language.","m":20,
     "c":"A Virtual Assistant handles the recurring work that keeps a client business moving: inbox, calendar, files, data, simple content and follow-up. You are not a guesser. You work from instructions, you ask when something is unclear, and you confirm when it is done.",
     "n":"Ask two students to describe a job they think a VA does. Correct any answer that sounds like an agency-level strategist role.",
     "p":"Slide 1: The VA is the operator, not the strategist.\\nSlide 2: Three buckets of VA work — admin, communication, content support.\\nSlide 3: What clients actually complain about: silence, missed steps, no confirmation.",
     "e":"A client sends 40 invoices to be logged in a sheet. A good VA confirms the column format first, logs them, then replies with the file link and a note about two invoices that were unreadable.",
     "a":"Write three sentences describing the kind of client you want to work with and why."},
    {"t":"Types of VA work and who hires them","o":"Match common client types to the tasks they usually delegate.","m":20,
     "c":"Coaches, agencies, e-commerce sellers, real estate teams and small local businesses hire VAs for different reasons. Knowing who hires for what helps you aim your applications.",
     "n":"Use local examples students can picture. Avoid overseas-only examples.",
     "p":"Slide 1: Five client types.\\nSlide 2: What each one delegates first.\\nSlide 3: Where the beginner roles are.",
     "e":"An e-commerce seller delegates order tracking and customer replies before they delegate anything creative.",
     "a":"Pick one client type and list five tasks you could take over in your first month."},
    {"t":"Freelancer, contractor or employee","o":"Explain the common working arrangements and what each expects of you.","m":15,"ty":"text"}]},
  {"t":"Setting up to work","d":"Tools, workspace and habits.","l":[
    {"t":"Your workspace, equipment and internet","o":"Set up a work area that will not embarrass you on a client call.","m":20,"ty":"checklist"},
    {"t":"Professional accounts and email","o":"Create a professional email address and account set.","m":20,"ty":"tutorial"},
    {"t":"Protecting client information","o":"Handle passwords and client files safely.","m":20,"ty":"text"}]},
  {"t":"Working like a professional","d":"How reliable VAs behave.","l":[
    {"t":"Following instructions accurately","o":"Turn a vague client request into a clear task list.","m":25,"ty":"practical_activity"},
    {"t":"Reporting your work","o":"Write a short end-of-day update a client will actually read.","m":20,"ty":"text"},
    {"t":"Common beginner mistakes","o":"Recognise the mistakes that cost beginners their first client.","m":15,"ty":"text"}]}]'::jsonb);

select public.seed_course('professional-client-communication','Professional Client Communication',
 'Write and speak with clients clearly, politely and confidently — in English that sounds natural, not stiff.',
 'level_1', null,
 array['Write clear client emails and messages','Ask good clarifying questions','Handle delays and mistakes professionally'],
 array['Virtual Assistant Foundations recommended'], 2, false, true, 200,
 '[{"t":"Written communication","l":[
    {"t":"Writing a clear client email","o":"Structure an email so the client can reply in one line.","m":25,"ty":"text"},
    {"t":"Chat and message etiquette","o":"Match tone and speed to the channel you are using.","m":20,"ty":"text"},
    {"t":"Asking clarifying questions","o":"Ask questions that unblock you without sounding lost.","m":20,"ty":"practical_activity"}]},
  {"t":"Difficult moments","l":[
    {"t":"Reporting a delay","o":"Tell a client about a delay before they notice it.","m":20,"ty":"text"},
    {"t":"Admitting and fixing a mistake","o":"Own an error and present the fix in the same message.","m":20,"ty":"text"},
    {"t":"Saying no and setting expectations","o":"Decline or renegotiate a request without losing the client.","m":20,"ty":"text"}]},
  {"t":"Live communication","l":[
    {"t":"Preparing for a client call","o":"Prepare an agenda and notes before a call.","m":20,"ty":"checklist"},
    {"t":"Taking meeting notes and action items","o":"Turn a call into a shared action list.","m":25,"ty":"practical_activity"},
    {"t":"English confidence for calls","o":"Practise common call phrases out loud.","m":30,"ty":"live_zoom"}]}]'::jsonb);

select public.seed_course('essential-va-tools','Essential VA Tools',
 'The everyday tools you will be expected to know: Google Workspace, Zoom, Slack, Trello, Canva, Loom and Calendly.',
 'level_1', null,
 array['Navigate the core VA toolset confidently','Organise client files and calendars','Record a clear walkthrough video'],
 array['A Google account'], 3, false, true, 260,
 '[{"t":"Google Workspace","l":[
    {"t":"Gmail for client inboxes","o":"Use labels, filters and templates to keep an inbox under control.","m":25,"ty":"screenshot_walkthrough"},
    {"t":"Drive folder structures that scale","o":"Build a folder structure a client can navigate alone.","m":20,"ty":"tutorial"},
    {"t":"Docs and Sheets basics","o":"Create, format and share documents and simple sheets.","m":30,"ty":"tutorial"}]},
  {"t":"Communication tools","l":[
    {"t":"Zoom and Google Meet","o":"Join, host, share screen and record a meeting.","m":20,"ty":"tutorial"},
    {"t":"Slack for client teams","o":"Use channels, threads and status the way teams expect.","m":20,"ty":"tutorial"},
    {"t":"Loom walkthroughs","o":"Record a short screen walkthrough with clear narration.","m":20,"ty":"practical_activity"}]},
  {"t":"Work management","l":[
    {"t":"Trello boards","o":"Set up a board that mirrors a real client workflow.","m":25,"ty":"tutorial"},
    {"t":"Calendly scheduling","o":"Create a booking link with sensible availability rules.","m":20,"ty":"tutorial"},
    {"t":"Choosing the right tool for a task","o":"Pick tools based on the client, not on habit.","m":15,"ty":"text"}]}]'::jsonb);

select public.seed_course('general-administrative-va-l1','General Administrative VA',
 'Core admin work: inbox management, calendars, data entry, file organisation and simple reporting.',
 'level_1', null,
 array['Manage an inbox to zero without losing anything','Schedule across time zones','Enter and check data accurately'],
 array['Essential VA Tools recommended'], 4, false, true, 240,
 '[{"t":"Inbox and calendar","l":[
    {"t":"Inbox management systems","o":"Apply a triage system to a full client inbox.","m":25,"ty":"practical_activity"},
    {"t":"Calendar management and time zones","o":"Schedule meetings across PHT, EST and AEST without errors.","m":25,"ty":"tutorial"},
    {"t":"Handling scheduling conflicts","o":"Resolve a double booking and communicate the change.","m":20,"ty":"text"}]},
  {"t":"Data and files","l":[
    {"t":"Accurate data entry","o":"Enter data with a self-check step that catches errors.","m":25,"ty":"practical_activity"},
    {"t":"Building a simple tracker","o":"Build a tracker with clear columns and validation.","m":30,"ty":"practical_activity"},
    {"t":"File naming and version control","o":"Name and version files so nothing is ever lost.","m":15,"ty":"checklist"}]},
  {"t":"Routine reporting","l":[
    {"t":"Daily and weekly updates","o":"Send a consistent update the client can skim.","m":20,"ty":"text"},
    {"t":"Simple summaries from a sheet","o":"Summarise a data sheet into three useful numbers.","m":25,"ty":"practical_activity"},
    {"t":"Building your own SOPs","o":"Write an SOP another VA could follow.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('time-and-task-management','Time and Task Management',
 'Plan a working day, protect deadlines and stay reliable across several clients.',
 'level_1', null,
 array['Plan a realistic working day','Prioritise competing client requests','Track time honestly'],
 array[]::text[], 5, false, true, 160,
 '[{"t":"Planning your day","l":[
    {"t":"Time blocking for VAs","o":"Build a daily block plan around client hours.","m":20,"ty":"text"},
    {"t":"Prioritising client requests","o":"Rank requests when three clients all say urgent.","m":20,"ty":"practical_activity"},
    {"t":"Realistic estimates","o":"Estimate task time and add a sensible buffer.","m":20,"ty":"text"}]},
  {"t":"Staying on track","l":[
    {"t":"Task tracking that survives a busy week","o":"Keep one list you actually trust.","m":20,"ty":"tutorial"},
    {"t":"Time tracking and proof of work","o":"Track hours in a way clients accept.","m":20,"ty":"tutorial"},
    {"t":"Handling interruptions","o":"Protect deep work without ignoring the client.","m":15,"ty":"text"}]},
  {"t":"Sustainable work","l":[
    {"t":"Working across time zones","o":"Set an overlap schedule that is sustainable.","m":15,"ty":"text"},
    {"t":"Avoiding burnout","o":"Spot early burnout signs and adjust your load.","m":15,"ty":"text"},
    {"t":"Weekly review routine","o":"Run a 20-minute weekly review.","m":15,"ty":"checklist"}]}]'::jsonb);

select public.seed_course('basic-online-research','Basic Online Research',
 'Find accurate information quickly, check the source, and present findings a client can use.',
 'level_1', null,
 array['Run structured searches','Judge whether a source is trustworthy','Present findings in a clean summary'],
 array[]::text[], 6, false, true, 150,
 '[{"t":"Searching well","l":[
    {"t":"Search operators that save hours","o":"Use search operators to narrow results fast.","m":20,"ty":"tutorial"},
    {"t":"Turning a vague brief into a search plan","o":"Convert a one-line request into search questions.","m":20,"ty":"practical_activity"},
    {"t":"Knowing when to stop researching","o":"Decide when you have enough to report.","m":15,"ty":"text"}]},
  {"t":"Checking sources","l":[
    {"t":"Judging source quality","o":"Rank sources by reliability before you use them.","m":20,"ty":"text"},
    {"t":"Cross-checking facts","o":"Confirm a fact against a second independent source.","m":20,"ty":"practical_activity"},
    {"t":"Recording where you found it","o":"Keep a source trail the client can follow.","m":15,"ty":"text"}]},
  {"t":"Reporting findings","l":[
    {"t":"Research summary format","o":"Write a summary with findings, sources and a recommendation.","m":20,"ty":"downloadable_resource"},
    {"t":"Building a comparison sheet","o":"Compare options on the criteria the client cares about.","m":25,"ty":"practical_activity"},
    {"t":"Presenting uncertainty honestly","o":"Say clearly what you could not confirm.","m":15,"ty":"text"}]}]'::jsonb);

select public.seed_course('basic-customer-service','Basic Customer Service',
 'Answer customers with warmth and accuracy, and handle complaints without escalating them.',
 'level_1', null,
 array['Reply to common customer messages','De-escalate an upset customer','Know when to escalate'],
 array[]::text[], 7, false, true, 170,
 '[{"t":"Customer service basics","l":[
    {"t":"What good service feels like","o":"Describe the difference between fast and helpful.","m":15,"ty":"text"},
    {"t":"Tone, empathy and clarity","o":"Rewrite a blunt reply so it lands well.","m":20,"ty":"practical_activity"},
    {"t":"Reply templates without sounding robotic","o":"Adapt a template to a specific customer.","m":20,"ty":"downloadable_resource"}]},
  {"t":"Handling problems","l":[
    {"t":"De-escalating an angry customer","o":"Apply a calm-acknowledge-solve sequence.","m":25,"ty":"practical_activity"},
    {"t":"Refunds, returns and policy limits","o":"Explain a policy without sounding defensive.","m":20,"ty":"text"},
    {"t":"When to escalate","o":"Recognise the cases that must go to the client.","m":15,"ty":"checklist"}]},
  {"t":"Working a queue","l":[
    {"t":"Ticket queues and shared inboxes","o":"Work a queue without losing a message.","m":20,"ty":"tutorial"},
    {"t":"Response time expectations","o":"Set and meet realistic response targets.","m":15,"ty":"text"},
    {"t":"Logging issues for the client","o":"Record recurring issues in a simple log.","m":20,"ty":"practical_activity"}]}]'::jsonb);

select public.seed_course('canva-content-editing-basics','Canva and Content Editing Basics',
 'Create clean, on-brand graphics and short video edits using templates.',
 'level_1', null,
 array['Build graphics from a brand template','Resize designs for each platform','Edit a short video with captions'],
 array['A free Canva account'], 8, false, true, 200,
 '[{"t":"Canva fundamentals","l":[
    {"t":"Canva tour and account setup","o":"Navigate Canva and find brand assets.","m":20,"ty":"screenshot_walkthrough"},
    {"t":"Working from a brand template","o":"Edit a template without breaking the brand.","m":25,"ty":"tutorial"},
    {"t":"Colour, type and spacing basics","o":"Apply simple rules that make designs look tidy.","m":20,"ty":"text"}]},
  {"t":"Producing assets","l":[
    {"t":"Social post sizes that matter","o":"Resize one design for feed, story and banner.","m":20,"ty":"tutorial"},
    {"t":"Simple carousels and quote cards","o":"Build a three-slide carousel from a caption.","m":25,"ty":"practical_activity"},
    {"t":"Exporting and file handover","o":"Export in the right format and hand files over cleanly.","m":15,"ty":"checklist"}]},
  {"t":"Short-form video","l":[
    {"t":"CapCut basics","o":"Trim, caption and export a short video.","m":30,"ty":"tutorial"},
    {"t":"Captions and readability","o":"Add captions people can read on a phone.","m":20,"ty":"practical_activity"},
    {"t":"Respecting client brand rules","o":"Follow a brand guide without being told twice.","m":15,"ty":"text"}]}]'::jsonb);

select public.seed_course('social-media-assistance-basics','Social Media Assistance Basics',
 'Support a client social account: planning, scheduling, captions and simple engagement.',
 'level_1', null,
 array['Build a simple content calendar','Schedule posts on the main platforms','Write captions in a client voice'],
 array['Canva and Content Editing Basics recommended'], 9, false, true, 190,
 '[{"t":"Planning content","l":[
    {"t":"Content pillars in plain language","o":"Group a client posts into three or four themes.","m":20,"ty":"text"},
    {"t":"Building a content calendar","o":"Build a two-week calendar in a sheet.","m":25,"ty":"practical_activity"},
    {"t":"Sourcing and organising assets","o":"Collect and file approved images and clips.","m":20,"ty":"tutorial"}]},
  {"t":"Publishing","l":[
    {"t":"Scheduling with Meta Business Suite","o":"Schedule a week of posts and check the queue.","m":25,"ty":"screenshot_walkthrough"},
    {"t":"Writing captions and hashtags","o":"Write a caption that sounds like the client.","m":20,"ty":"practical_activity"},
    {"t":"Post checks before publishing","o":"Run a pre-publish checklist.","m":15,"ty":"checklist"}]},
  {"t":"Engagement and reporting","l":[
    {"t":"Comment and DM handling","o":"Reply to comments within client guidelines.","m":20,"ty":"text"},
    {"t":"Basic metrics that matter","o":"Read reach, engagement and follows correctly.","m":20,"ty":"text"},
    {"t":"Simple monthly report","o":"Report the month in one page.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('marketing-assistance-foundations','Marketing Assistance Foundations',
 'How marketing works end to end, plus a plain-language introduction to paid advertising and email deliverability.',
 'level_1', null,
 array['Explain the marketing funnel','Define the core advertising terms','Explain deliverability at a high level'],
 array[]::text[], 10, false, true, 210,
 '[{"t":"Marketing basics","l":[
    {"t":"Funnels, offers and audiences","o":"Explain how a lead becomes a customer.","m":25,"ty":"text"},
    {"t":"Organic versus paid marketing","o":"Explain the difference and when each is used.","m":20,"ty":"text"},
    {"t":"Where a VA fits in a marketing team","o":"List the marketing tasks a beginner VA can own.","m":15,"ty":"text"}]},
  {"t":"Advertising vocabulary","d":"Concepts only. No account setup at this level.","l":[
    {"t":"What Meta Ads and Google Ads are","o":"Describe what each platform is used for.","m":20,"ty":"text",
     "c":"Meta Ads places ads on Facebook and Instagram. Google Ads places ads on search results, YouTube and partner sites. As a Level 1 student you are learning the vocabulary so you can follow instructions later — you are not setting up accounts yet.",
     "n":"Keep this conceptual. Redirect any question about pixels, tracking or conversion setup to Level 3."},
    {"t":"Campaign, ad set and ad","o":"Describe the three levels of a campaign structure.","m":20,"ty":"text"},
    {"t":"Objective, audience, creative, copy, budget, schedule","o":"Define the six inputs every campaign needs.","m":25,"ty":"text"},
    {"t":"Clicks, leads, conversions, CPC and CPL","o":"Read the five numbers that appear in every ad report.","m":25,"ty":"text"}]},
  {"t":"Email marketing basics","l":[
    {"t":"What deliverability means","o":"Explain why an email may never reach the inbox.","m":20,"ty":"text"},
    {"t":"Bounces and list hygiene","o":"Explain hard and soft bounces and why lists are cleaned.","m":20,"ty":"text"},
    {"t":"SPF, DKIM and DMARC at a high level","o":"Say what each one proves — without configuring anything.","m":20,"ty":"text",
     "c":"SPF, DKIM and DMARC are three checks that help a receiving mail server decide whether an email really came from the domain it claims. SPF lists who may send. DKIM adds a signature. DMARC tells the receiver what to do when a check fails. Setting these up is technical work that belongs to Level 3 — at Level 1 you only need to recognise the names.",
     "n":"Do not open a DNS panel in this session. Students at this level should not be editing DNS records."}]}]'::jsonb);

select public.seed_course('finding-va-opportunities','Finding VA Opportunities',
 'Where the jobs are, how to apply, and how to spot a scam.',
 'level_1', null,
 array['Search job platforms effectively','Write an application that gets replies','Recognise scam listings'],
 array[]::text[], 11, false, true, 160,
 '[{"t":"Where to look","l":[
    {"t":"Job platforms and communities","o":"List the platforms worth your time as a beginner.","m":20,"ty":"text"},
    {"t":"Reading a job post properly","o":"Extract the real requirements from a listing.","m":20,"ty":"practical_activity"},
    {"t":"Spotting scams and red flags","o":"Identify the warning signs in a fake listing.","m":20,"ty":"checklist"}]},
  {"t":"Applying","l":[
    {"t":"Writing an application that gets read","o":"Write a short, specific application message.","m":25,"ty":"practical_activity"},
    {"t":"Tailoring to the job post","o":"Mirror the client language without copying it.","m":20,"ty":"text"},
    {"t":"Following up without pestering","o":"Send one useful follow-up.","m":15,"ty":"text"}]},
  {"t":"Rates and agreements","l":[
    {"t":"Understanding beginner rates","o":"Set a starting rate you can defend.","m":20,"ty":"text"},
    {"t":"Trial tasks and paid tests","o":"Decide which unpaid tests are reasonable.","m":15,"ty":"text"},
    {"t":"Simple working agreements","o":"Confirm scope, hours and payment in writing.","m":20,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('resume-profile-portfolio','Resume, Profile, and Portfolio Basics',
 'Build the three assets every client checks: a resume, an online profile, and a portfolio with real samples.',
 'level_1', null,
 array['Write a VA resume with no VA experience','Complete a strong platform profile','Build a portfolio from practice work'],
 array[]::text[], 12, false, true, 180,
 '[{"t":"Your resume","l":[
    {"t":"VA resume structure","o":"Lay out a one-page VA resume.","m":25,"ty":"downloadable_resource"},
    {"t":"Writing experience without VA history","o":"Translate past work into VA-relevant skills.","m":25,"ty":"practical_activity"},
    {"t":"Skills and tools section","o":"List tools honestly and usefully.","m":15,"ty":"text"}]},
  {"t":"Your online profile","l":[
    {"t":"Profile headline and summary","o":"Write a headline a client understands in three seconds.","m":20,"ty":"practical_activity"},
    {"t":"Photo and presentation","o":"Choose a photo that reads as professional.","m":15,"ty":"text"},
    {"t":"LinkedIn basics for VAs","o":"Complete the sections clients actually look at.","m":20,"ty":"tutorial"}]},
  {"t":"Your portfolio","l":[
    {"t":"Portfolio pieces you can create today","o":"Produce three samples from course activities.","m":30,"ty":"practical_activity"},
    {"t":"Presenting samples with context","o":"Explain the task, your work and the result.","m":20,"ty":"downloadable_resource"},
    {"t":"Keeping client work confidential","o":"Share samples without exposing client data.","m":15,"ty":"text"}]}]'::jsonb);

select public.seed_course('interview-preparation','Interview Preparation',
 'Prepare for client interviews: common questions, live task tests, and how to close the call.',
 'level_1', null,
 array['Answer the ten most common questions','Handle a live task test','Ask the client good questions'],
 array['Resume, Profile, and Portfolio Basics recommended'], 13, false, true, 150,
 '[{"t":"Before the interview","l":[
    {"t":"Researching the client","o":"Find the three facts worth mentioning.","m":20,"ty":"practical_activity"},
    {"t":"Setup, lighting and audio","o":"Test your setup before the call.","m":15,"ty":"checklist"},
    {"t":"Preparing your introduction","o":"Deliver a 60-second introduction.","m":20,"ty":"practical_activity"}]},
  {"t":"During the interview","l":[
    {"t":"Ten common questions","o":"Answer the questions clients ask every time.","m":25,"ty":"text"},
    {"t":"Handling a live task test","o":"Work through a task while narrating your steps.","m":25,"ty":"live_zoom"},
    {"t":"Questions you should ask","o":"Ask questions that show you think about their business.","m":15,"ty":"text"}]},
  {"t":"After the interview","l":[
    {"t":"Thank-you message","o":"Send a short follow-up that adds something.","m":10,"ty":"downloadable_resource"},
    {"t":"Handling rejection","o":"Ask for feedback and apply it.","m":10,"ty":"text"},
    {"t":"Negotiating the offer","o":"Confirm rate, hours and start date clearly.","m":10,"ty":"text"}]}]'::jsonb);

select public.seed_course('client-onboarding-foundations','Client Onboarding Foundations',
 'Your first two weeks with a new client: access, expectations, systems and the first win.',
 'level_1', null,
 array['Run a structured onboarding call','Collect access safely','Deliver an early visible win'],
 array[]::text[], 14, false, true, 160,
 '[{"t":"Starting well","l":[
    {"t":"The onboarding call","o":"Run a first call with a clear agenda.","m":25,"ty":"downloadable_resource"},
    {"t":"Collecting access safely","o":"Request access without handling raw passwords.","m":20,"ty":"checklist"},
    {"t":"Agreeing on communication rules","o":"Set channels, hours and response times.","m":20,"ty":"text"}]},
  {"t":"Setting up systems","l":[
    {"t":"Shared folders and trackers","o":"Set up the shared workspace on day one.","m":25,"ty":"practical_activity"},
    {"t":"Documenting client processes","o":"Write down each process as you learn it.","m":25,"ty":"practical_activity"},
    {"t":"Weekly rhythm","o":"Agree a weekly check-in and report format.","m":15,"ty":"text"}]},
  {"t":"Your first 30 days","l":[
    {"t":"Finding an early win","o":"Deliver one visible improvement in week one.","m":15,"ty":"text"},
    {"t":"Asking for feedback","o":"Request feedback before problems build up.","m":10,"ty":"text"},
    {"t":"Growing the engagement","o":"Offer to take on the next logical task.","m":15,"ty":"text"}]}]'::jsonb);

-- ============ LEVEL 2 — Job-Ready Specialization ======================
select public.seed_course('l2-general-admin','General Administrative VA (Level 2)',
 'Run the full admin function for a client: systems, trackers, reporting and process documentation.',
 'level_2','general-admin',
 array['Own a client admin workflow end to end','Build trackers and dashboards','Document processes as SOPs'],
 array['Level 1 completion or Manager approval'], 1, false, true, 320,
 '[{"t":"Owning the workflow","l":[
    {"t":"Mapping a client admin workflow","o":"Map every recurring task on one page.","m":35,"ty":"practical_activity"},
    {"t":"Building an operations tracker","o":"Build a tracker with status, owner and due date.","m":40,"ty":"practical_activity"},
    {"t":"Automating repeat steps safely","o":"Replace three manual steps with simple automation.","m":30,"ty":"tutorial"}]},
  {"t":"Reporting","l":[
    {"t":"Weekly operations report","o":"Produce a report a client reads in two minutes.","m":35,"ty":"downloadable_resource"},
    {"t":"Dashboards in Sheets","o":"Build a one-tab dashboard from raw data.","m":40,"ty":"practical_activity"},
    {"t":"Flagging risks early","o":"Escalate slipping work before the deadline.","m":25,"ty":"text"}]},
  {"t":"Documentation","l":[
    {"t":"Writing SOPs that get used","o":"Write an SOP with screenshots and checks.","m":35,"ty":"downloadable_resource"},
    {"t":"Handover documents","o":"Prepare a handover another VA can pick up.","m":30,"ty":"downloadable_resource"},
    {"t":"Keeping documentation current","o":"Set a review cycle for every SOP.","m":25,"ty":"checklist"}]}]'::jsonb);

select public.seed_course('l2-marketing-assistant','Marketing Assistant',
 'Support a marketing team: calendars, briefs, asset coordination and campaign reporting.',
 'level_2','marketing-assistant',
 array['Run a marketing calendar','Prepare campaign briefs','Assemble a campaign report'],
 array['Marketing Assistance Foundations'], 2, false, true, 300,
 '[{"t":"Planning support","l":[
    {"t":"Running a marketing calendar","o":"Maintain a calendar across channels.","m":35,"ty":"practical_activity"},
    {"t":"Writing a campaign brief","o":"Turn a client idea into a brief the team can act on.","m":35,"ty":"downloadable_resource"},
    {"t":"Coordinating assets and approvals","o":"Track assets from draft to approved.","m":30,"ty":"practical_activity"}]},
  {"t":"Execution support","l":[
    {"t":"Landing page and form checks","o":"Check a page and form before a campaign goes live.","m":30,"ty":"checklist"},
    {"t":"Scheduling across channels","o":"Schedule a coordinated multi-channel push.","m":30,"ty":"practical_activity"},
    {"t":"Launch day checklist","o":"Run a launch checklist without skipping steps.","m":25,"ty":"checklist"}]},
  {"t":"Reporting","l":[
    {"t":"Pulling campaign numbers","o":"Collect metrics from each channel into one sheet.","m":35,"ty":"practical_activity"},
    {"t":"Writing the campaign summary","o":"Summarise results with a recommendation.","m":30,"ty":"downloadable_resource"},
    {"t":"Presenting to the client","o":"Walk a client through results without jargon.","m":25,"ty":"live_zoom"}]}]'::jsonb);

select public.seed_course('l2-social-media','Social Media Assistant',
 'Own a client social calendar: research, scheduling, community management and monthly reporting.',
 'level_2','social-media',
 array['Plan and schedule a month of content','Manage community responses','Report on performance'],
 array['Social Media Assistance Basics'], 3, false, true, 300,
 '[{"t":"Planning","l":[
    {"t":"Monthly content plan","o":"Plan a month around client offers and events.","m":40,"ty":"practical_activity"},
    {"t":"Competitor and trend research","o":"Research what is working in the client niche.","m":30,"ty":"practical_activity"},
    {"t":"Building the asset pipeline","o":"Keep graphics and clips flowing ahead of schedule.","m":30,"ty":"tutorial"}]},
  {"t":"Publishing and community","l":[
    {"t":"Scheduling across platforms","o":"Schedule and verify posts on three platforms.","m":35,"ty":"screenshot_walkthrough"},
    {"t":"Community management rules","o":"Reply within an approved response framework.","m":30,"ty":"text"},
    {"t":"Handling negative comments","o":"Respond to criticism without escalating.","m":25,"ty":"practical_activity"}]},
  {"t":"Reporting","l":[
    {"t":"Reading platform insights","o":"Interpret insights without over-claiming.","m":30,"ty":"text"},
    {"t":"Monthly social report","o":"Build a report with numbers and next steps.","m":40,"ty":"downloadable_resource"},
    {"t":"Recommending changes","o":"Propose three changes backed by data.","m":25,"ty":"practical_activity"}]}]'::jsonb);

select public.seed_course('l2-graphic-content','Graphic and Content Editing Assistant',
 'Produce brand-consistent graphics and short videos at production speed.',
 'level_2','graphic-content',
 array['Work from a brand guide','Produce a batch of assets on schedule','Edit short-form video with captions'],
 array['Canva and Content Editing Basics'], 4, false, true, 300,
 '[{"t":"Brand systems","l":[
    {"t":"Reading a brand guide","o":"Apply a brand guide to a new asset.","m":30,"ty":"text"},
    {"t":"Building reusable templates","o":"Turn a design into a reusable template set.","m":40,"ty":"practical_activity"},
    {"t":"Asset naming and libraries","o":"Organise a client asset library.","m":25,"ty":"checklist"}]},
  {"t":"Production","l":[
    {"t":"Batch producing a content set","o":"Produce ten assets in one working session.","m":45,"ty":"practical_activity"},
    {"t":"Short-form video editing","o":"Cut, caption and export three short videos.","m":45,"ty":"tutorial"},
    {"t":"Revision rounds","o":"Handle feedback without losing versions.","m":25,"ty":"text"}]},
  {"t":"Delivery","l":[
    {"t":"Export specifications","o":"Export to platform specifications correctly.","m":25,"ty":"checklist"},
    {"t":"Handover packages","o":"Deliver an organised package with source files.","m":30,"ty":"practical_activity"},
    {"t":"Quality check before delivery","o":"Run a final quality pass.","m":25,"ty":"checklist"}]}]'::jsonb);

select public.seed_course('l2-research','Research Assistant',
 'Deliver structured research: market scans, prospect research and clear written findings.',
 'level_2','research',
 array['Run a structured research project','Build comparison matrices','Write findings with sources'],
 array['Basic Online Research'], 5, false, true, 280,
 '[{"t":"Project setup","l":[
    {"t":"Scoping a research request","o":"Turn a client request into a research scope.","m":30,"ty":"practical_activity"},
    {"t":"Building the research plan","o":"Plan sources, questions and time budget.","m":30,"ty":"downloadable_resource"},
    {"t":"Organising as you go","o":"Keep notes and sources findable.","m":25,"ty":"tutorial"}]},
  {"t":"Doing the work","l":[
    {"t":"Market and competitor scans","o":"Produce a competitor scan on five companies.","m":45,"ty":"practical_activity"},
    {"t":"Company and contact research","o":"Verify company details from primary sources.","m":35,"ty":"practical_activity"},
    {"t":"Data collection into sheets","o":"Structure findings for reuse.","m":30,"ty":"practical_activity"}]},
  {"t":"Delivering findings","l":[
    {"t":"Comparison matrices","o":"Build a matrix that makes the choice obvious.","m":35,"ty":"downloadable_resource"},
    {"t":"Executive summaries","o":"Write a summary a busy client can act on.","m":30,"ty":"downloadable_resource"},
    {"t":"Citing and confidence levels","o":"State how confident you are and why.","m":20,"ty":"text"}]}]'::jsonb);

select public.seed_course('l2-lead-generation','Lead Generation Assistant',
 'Build accurate, verified prospect lists that a sales team can actually use.',
 'level_2','lead-generation',
 array['Define an ideal customer profile','Build and verify a lead list','Keep list data clean'],
 array['Basic Online Research'], 6, false, true, 300,
 '[{"t":"Targeting","l":[
    {"t":"Ideal customer profile","o":"Write an ICP with clear filters.","m":30,"ty":"downloadable_resource"},
    {"t":"Search filters in Sales Navigator","o":"Build a filtered prospect search.","m":40,"ty":"screenshot_walkthrough"},
    {"t":"Apollo searches and exports","o":"Export a filtered list correctly.","m":35,"ty":"tutorial"}]},
  {"t":"Building the list","l":[
    {"t":"Finding work emails","o":"Locate contact emails from allowed sources.","m":35,"ty":"tutorial"},
    {"t":"Verifying with NeverBounce or ZeroBounce","o":"Verify a list and read the results.","m":30,"ty":"tutorial"},
    {"t":"List structure and required fields","o":"Deliver a list in the format sales expects.","m":30,"ty":"practical_activity"}]},
  {"t":"Quality and compliance","l":[
    {"t":"Deduplication and data hygiene","o":"Remove duplicates and fix formatting.","m":35,"ty":"practical_activity"},
    {"t":"Respecting privacy rules","o":"Follow basic data and consent rules.","m":25,"ty":"text"},
    {"t":"Weekly list reporting","o":"Report list volume and quality weekly.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('l2-customer-service','Customer Service Assistant',
 'Handle a real support queue: tickets, live chat, macros and escalation.',
 'level_2','customer-service',
 array['Work a ticket queue to target','Write reusable macros','Escalate correctly'],
 array['Basic Customer Service'], 7, false, true, 290,
 '[{"t":"Working the queue","l":[
    {"t":"Zendesk and Freshdesk basics","o":"Navigate a ticket system confidently.","m":40,"ty":"screenshot_walkthrough"},
    {"t":"Triage and priority rules","o":"Sort a queue by urgency and impact.","m":30,"ty":"practical_activity"},
    {"t":"Live chat handling","o":"Manage several chats without dropping one.","m":30,"ty":"tutorial"}]},
  {"t":"Quality replies","l":[
    {"t":"Writing macros and saved replies","o":"Write macros that stay personal.","m":35,"ty":"downloadable_resource"},
    {"t":"Difficult customer scenarios","o":"Work through five real complaint scenarios.","m":40,"ty":"practical_activity"},
    {"t":"Knowledge base articles","o":"Turn repeat questions into help articles.","m":30,"ty":"practical_activity"}]},
  {"t":"Metrics","l":[
    {"t":"Response and resolution times","o":"Track the metrics support teams are judged on.","m":25,"ty":"text"},
    {"t":"Customer satisfaction follow-up","o":"Run a simple satisfaction check.","m":25,"ty":"text"},
    {"t":"Weekly support report","o":"Report volume, themes and fixes.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('l2-email-marketing','Email Marketing Assistant',
 'Build and send campaigns, manage segments, and run pre-send checks that prevent disasters.',
 'level_2','email-marketing',
 array['Build a campaign from a brief','Manage lists and segments','Check authentication is present before sending'],
 array['Marketing Assistance Foundations'], 8, false, true, 310,
 '[{"t":"Building campaigns","l":[
    {"t":"Mailchimp and ActiveCampaign basics","o":"Build a campaign in the client platform.","m":40,"ty":"screenshot_walkthrough"},
    {"t":"Templates and reusable blocks","o":"Build a template the client can reuse.","m":35,"ty":"practical_activity"},
    {"t":"Subject lines and preview text","o":"Write and test subject line variants.","m":25,"ty":"practical_activity"}]},
  {"t":"Lists and segments","l":[
    {"t":"Managing lists and tags","o":"Keep audiences organised and accurate.","m":30,"ty":"tutorial"},
    {"t":"Segmenting for relevance","o":"Build three useful segments from client data.","m":35,"ty":"practical_activity"},
    {"t":"List hygiene in practice","o":"Remove inactive and bouncing contacts.","m":30,"ty":"checklist"}]},
  {"t":"Sending safely","d":"Checking, collecting and reporting only — configuration is Level 3.","l":[
    {"t":"Checking whether authentication is set up","o":"Confirm whether SPF, DKIM and DMARC are already in place.","m":30,"ty":"tutorial",
     "c":"Your job at this level is to check and report, not to configure. Most email platforms show a domain or sending-domain status page that tells you whether authentication passed. If something is missing, you collect the details the client or their developer will need — you do not edit DNS records yourself.",
     "n":"If a student asks how to add a DNS record, hold the line: that is Level 3 material and usually the client developer job."},
    {"t":"Collecting domain information for the client","o":"Gather the information a technical person needs to fix authentication.","m":25,"ty":"checklist"},
    {"t":"Pre-send checklist and reporting","o":"Run a full pre-send check and report results.","m":30,"ty":"checklist"}]}]'::jsonb);

select public.seed_course('l2-crm','CRM Assistant',
 'Keep a CRM trustworthy: contacts, pipelines, records and reporting.',
 'level_2','crm',
 array['Maintain clean CRM data','Move deals through a pipeline correctly','Report pipeline health'],
 array['Level 1 completion'], 9, false, true, 280,
 '[{"t":"CRM fundamentals","l":[
    {"t":"HubSpot navigation","o":"Find contacts, companies and deals confidently.","m":35,"ty":"screenshot_walkthrough"},
    {"t":"Contact and company records","o":"Create and maintain complete records.","m":30,"ty":"practical_activity"},
    {"t":"Importing data safely","o":"Import a list without creating duplicates.","m":35,"ty":"tutorial"}]},
  {"t":"Pipelines","l":[
    {"t":"Deal stages and rules","o":"Move deals according to agreed stage rules.","m":30,"ty":"text"},
    {"t":"Logging activity","o":"Log calls, emails and notes consistently.","m":25,"ty":"practical_activity"},
    {"t":"Task and follow-up management","o":"Ensure no follow-up is missed.","m":25,"ty":"tutorial"}]},
  {"t":"Data quality and reporting","l":[
    {"t":"Deduplication and cleanup","o":"Run a monthly cleanup routine.","m":35,"ty":"checklist"},
    {"t":"Pipeline reports","o":"Build a report showing pipeline health.","m":35,"ty":"practical_activity"},
    {"t":"Spotting stale deals","o":"Flag deals that have gone quiet.","m":25,"ty":"text"}]}]'::jsonb);

select public.seed_course('l2-marketing-automation','Marketing Automation Assistant',
 'Build and maintain simple, reliable marketing workflows from approved plans.',
 'level_2','marketing-automation',
 array['Build a simple workflow from a plan','Test before activating','Document and monitor automations'],
 array['CRM Assistant or Email Marketing Assistant'], 10, false, true, 290,
 '[{"t":"Understanding workflows","l":[
    {"t":"Triggers, conditions and actions","o":"Read a workflow diagram accurately.","m":30,"ty":"text"},
    {"t":"Mapping a workflow before building","o":"Draw the workflow before touching the tool.","m":30,"ty":"practical_activity"},
    {"t":"Common beginner workflows","o":"Recognise welcome, follow-up and reminder patterns.","m":25,"ty":"text"}]},
  {"t":"Building","l":[
    {"t":"Building a welcome sequence","o":"Build a three-email welcome sequence.","m":40,"ty":"practical_activity"},
    {"t":"Internal notification workflows","o":"Notify the right person when something happens.","m":30,"ty":"tutorial"},
    {"t":"Naming and organising automations","o":"Name automations so anyone can find them.","m":20,"ty":"checklist"}]},
  {"t":"Testing and maintenance","l":[
    {"t":"Testing with a test contact","o":"Test end to end before switching on.","m":35,"ty":"checklist"},
    {"t":"Monitoring for failures","o":"Check automations weekly and report problems.","m":30,"ty":"text"},
    {"t":"Documenting what you built","o":"Document each automation for the client.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('l2-wordpress','WordPress and Website Support Assistant',
 'Make safe, correct updates to a client website: pages, posts, media and basic maintenance.',
 'level_2','wordpress',
 array['Update pages and posts safely','Manage media and basic SEO fields','Run routine site maintenance'],
 array['Level 1 completion'], 11, false, true, 290,
 '[{"t":"WordPress basics","l":[
    {"t":"Dashboard tour and user roles","o":"Navigate the dashboard and understand your permissions.","m":30,"ty":"screenshot_walkthrough"},
    {"t":"Pages versus posts","o":"Choose the right content type.","m":20,"ty":"text"},
    {"t":"Editing content safely","o":"Edit content without breaking layout.","m":35,"ty":"tutorial"}]},
  {"t":"Working with builders","l":[
    {"t":"Elementor basics","o":"Edit an Elementor page section safely.","m":40,"ty":"tutorial"},
    {"t":"Images, media and alt text","o":"Upload optimised images with alt text.","m":30,"ty":"practical_activity"},
    {"t":"Forms and confirmation checks","o":"Test a form end to end after any change.","m":30,"ty":"checklist"}]},
  {"t":"Maintenance","l":[
    {"t":"Backups before changes","o":"Confirm a backup exists before editing.","m":25,"ty":"checklist"},
    {"t":"Plugin and theme updates","o":"Apply updates in the right order and verify.","m":30,"ty":"tutorial"},
    {"t":"Reporting site issues","o":"Report a problem with enough detail to fix it.","m":25,"ty":"downloadable_resource"}]}]'::jsonb);

select public.seed_course('l2-digital-ads','Digital Advertising Assistant',
 'Prepare ad drafts, run pre-launch checks and build basic reports — always from approved instructions.',
 'level_2','digital-ads',
 array['Navigate Ads Manager and Google Ads','Prepare a draft campaign for approval','Build a basic performance report'],
 array['Marketing Assistance Foundations'], 12, false, true, 320,
 '[{"t":"Meta Ads Manager","d":"You are an assistant executing approved instructions, not a strategist.","l":[
    {"t":"Navigating Ads Manager","o":"Find campaigns, ad sets, ads and reports.","m":35,"ty":"screenshot_walkthrough"},
    {"t":"Recognising campaign structure","o":"Identify where a setting lives in the hierarchy.","m":30,"ty":"text"},
    {"t":"Creating a draft campaign","o":"Build a draft campaign from a written brief.","m":45,"ty":"practical_activity",
     "c":"Work only from the brief the client or media buyer approved. Build the campaign as a draft, never publish, and send a preview link for review. If the brief is missing a budget, a link or a start date, ask before you build.",
     "n":"Reinforce that publishing without approval is the fastest way to lose a client."},
    {"t":"Uploading approved creative and copy","o":"Add approved assets, copy and links exactly as briefed.","m":35,"ty":"tutorial"}]},
  {"t":"Checks and lead capture","l":[
    {"t":"Building a basic lead form","o":"Build a simple lead form from approved fields.","m":35,"ty":"tutorial"},
    {"t":"Reviewing ad previews","o":"Check every placement preview before submitting.","m":25,"ty":"checklist"},
    {"t":"Pre-launch checklist","o":"Verify names, dates, budgets, links and locations.","m":30,"ty":"checklist"}]},
  {"t":"Google Ads and reporting","l":[
    {"t":"Navigating Google Ads","o":"Move between campaigns, ad groups, keywords and ads.","m":35,"ty":"screenshot_walkthrough"},
    {"t":"Recognising account structure","o":"Explain how ad groups and keywords relate.","m":25,"ty":"text"},
    {"t":"Preparing a basic report","o":"Report spend, clicks, leads, CPC and CPL.","m":35,"ty":"downloadable_resource"}]}]'::jsonb);

-- ================= LEVEL 3 — Advanced (locked) ========================
-- Records and structure only. Lesson bodies stay empty until a Level 3
-- build; RLS keeps them unreachable for unapproved students either way.
do $$
declare
  v record;
begin
  for v in select * from (values
    ('l3-email-deliverability','Advanced Email Deliverability','email-marketing',
     'DNS records, authentication setup, reputation monitoring and inbox placement troubleshooting.',
     array['Authentication records','Reputation and warm-up','Inbox placement troubleshooting']),
    ('l3-marketing-automation','Advanced Marketing Automation','marketing-automation',
     'Multi-branch automations, data-driven conditions and cross-platform orchestration.',
     array['Branching logic','Data-driven conditions','Cross-platform orchestration']),
    ('l3-crm-systems','Advanced CRM Systems','crm',
     'Custom properties, pipeline architecture, lifecycle stages and CRM reporting design.',
     array['Pipeline architecture','Lifecycle stages','Custom reporting']),
    ('l3-wordpress','Advanced WordPress Support','wordpress',
     'Staging, migrations, performance, security hardening and troubleshooting.',
     array['Staging and migration','Performance','Security hardening']),
    ('l3-lead-gen-systems','Advanced Lead Generation Systems','lead-generation',
     'Enrichment pipelines, data operations and multi-source list building at scale.',
     array['Enrichment pipelines','Data operations','Scaled list building']),
    ('l3-reporting-analytics','Advanced Reporting and Analytics','marketing-assistant',
     'Analytics platforms, attribution basics and automated reporting pipelines.',
     array['Analytics platforms','Attribution basics','Automated reporting']),
    ('l3-meta-ads','Advanced Meta Ads Assistance','digital-ads',
     'Campaign optimisation support, audience architecture and structured testing.',
     array['Audience architecture','Testing frameworks','Optimisation support']),
    ('l3-google-ads','Advanced Google Ads Assistance','digital-ads',
     'Search account structure, keyword strategy support and performance troubleshooting.',
     array['Account structure','Keyword operations','Performance troubleshooting']),
    ('l3-tracking-conversion','Tracking and Conversion Setup','digital-ads',
     'Pixels, tags, events and conversion validation.',
     array['Pixel and tag setup','Event configuration','Conversion validation']),
    ('l3-zapier-make','Zapier and Make Integrations','marketing-automation',
     'Multi-step scenarios, error handling and safe data mapping between systems.',
     array['Multi-step scenarios','Error handling','Data mapping']),
    ('l3-api-webhooks','API and Webhook Concepts','marketing-automation',
     'How APIs and webhooks work, reading documentation, and testing endpoints safely.',
     array['API fundamentals','Webhooks','Reading documentation']),
    ('l3-funnel-implementation','Marketing Funnel Implementation','marketing-assistant',
     'Building and connecting funnel assets across pages, forms, CRM and email.',
     array['Funnel assets','System connections','End-to-end testing'])
  ) as t(slug,title,spec,descr,outcomes)
  loop
    perform public.seed_course(v.slug, v.title, v.descr, 'level_3', v.spec,
      v.outcomes, array['Level 2 specialization completed','Manager or Owner approval'],
      100, true, true, 360,
      jsonb_build_array(jsonb_build_object('t','Advanced modules',
        'd','Unlocked when a Manager or Owner grants Level 3 access.',
        'l', jsonb_build_array(
          jsonb_build_object('t', v.outcomes[1], 'o','Advanced module. Requires Level 3 access.','m',60,'ty','text'),
          jsonb_build_object('t', v.outcomes[2], 'o','Advanced module. Requires Level 3 access.','m',60,'ty','text'),
          jsonb_build_object('t', v.outcomes[3], 'o','Advanced module. Requires Level 3 access.','m',60,'ty','text')
        ))));
  end loop;
end $$;

-- --------------------------- prerequisites -------------------------------
insert into public.course_prerequisites (course_id, prerequisite_id, is_required)
-- The VALUES list must be the first FROM item: the course joins below refer
-- to its alias, and Postgres only resolves names introduced earlier.
select c.id, p.id, true
from (values
  ('professional-client-communication','virtual-assistant-foundations'),
  ('interview-preparation','resume-profile-portfolio'),
  ('l2-general-admin','general-administrative-va-l1'),
  ('l2-marketing-assistant','marketing-assistance-foundations'),
  ('l2-social-media','social-media-assistance-basics'),
  ('l2-graphic-content','canva-content-editing-basics'),
  ('l2-research','basic-online-research'),
  ('l2-lead-generation','basic-online-research'),
  ('l2-customer-service','basic-customer-service'),
  ('l2-email-marketing','marketing-assistance-foundations'),
  ('l2-digital-ads','marketing-assistance-foundations'),
  ('l3-email-deliverability','l2-email-marketing'),
  ('l3-meta-ads','l2-digital-ads'),
  ('l3-google-ads','l2-digital-ads'),
  ('l3-tracking-conversion','l2-digital-ads'),
  ('l3-crm-systems','l2-crm'),
  ('l3-wordpress','l2-wordpress'),
  ('l3-marketing-automation','l2-marketing-automation'),
  ('l3-zapier-make','l2-marketing-automation'),
  ('l3-api-webhooks','l2-marketing-automation'),
  ('l3-lead-gen-systems','l2-lead-generation'),
  ('l3-reporting-analytics','l2-marketing-assistant'),
  ('l3-funnel-implementation','l2-marketing-assistant')
) as m(course, prereq)
join public.courses c on c.slug = m.course
join public.courses p on p.slug = m.prereq
on conflict do nothing;

-- ------------- presentation sections for the flagship lesson --------------
insert into public.lesson_sections (lesson_id, title, body, section_type, coach_only, sort_order)
select l.id, s.title, s.body, s.stype, s.coach_only, s.ord
from public.lessons l
join public.courses c on c.id = l.course_id and c.slug = 'virtual-assistant-foundations'
join (values
 ('Why this matters','Clients do not hire a job title. They hire someone who removes work from their day and reports back clearly.','content',false,1),
 ('The three buckets of VA work','Administrative support. Communication support. Content and marketing support. Almost every beginner role is one of these three.','content',false,2),
 ('What a VA is not','You are not expected to invent strategy in week one. You execute clearly defined work accurately and on time.','content',false,3),
 ('Worked example','A client asks: "Can you sort out my inbox?" A weak VA archives everything. A strong VA asks which senders matter, agrees a labelling system, clears the backlog, then sends a one-paragraph summary of what changed.','example',false,4),
 ('Live activity','In pairs, take one vague client request and rewrite it as three specific tasks with a deadline and a definition of done.','activity',false,5),
 ('Coach note','Watch for students who over-promise. Push them to state what they will confirm before starting.','coach_note',true,6)
) as s(title, body, stype, coach_only, ord) on true
where l.title = 'What a Virtual Assistant really does'
on conflict do nothing;
