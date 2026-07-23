-- =====================================================================
-- VA Success Academy — 0004 Reference data
-- =====================================================================

insert into public.roles (code, name, description, rank) values
  ('student','Student','Learns, tracks progress, asks questions.',1),
  ('coach','Coach','Builds and delivers training, answers students.',2),
  ('manager','Manager','Runs enrolment, batches and access.',3),
  ('owner','Owner','Full control of the academy.',4)
on conflict (code) do nothing;

insert into public.permissions (code, name, category, description) values
  ('courses.view','View courses','courses',''),
  ('courses.manage','Create and edit courses','courses',''),
  ('lessons.manage','Create and edit lessons','courses',''),
  ('lessons.present','Open presentation mode','courses',''),
  ('students.view','View students','students',''),
  ('students.manage','Invite and manage students','students',''),
  ('students.access','Grant levels and course access','students',''),
  ('batches.manage','Manage batches','students',''),
  ('tools.manage','Manage the tools directory','library',''),
  ('resources.manage','Manage the resource library','library',''),
  ('questions.answer','Answer student questions','support',''),
  ('announcements.manage','Post announcements','support',''),
  ('sessions.manage','Manage Zoom sessions','support',''),
  ('users.manage','Manage user accounts','system',''),
  ('roles.manage','Assign roles and permissions','system',''),
  ('branding.manage','Configure branding','system',''),
  ('settings.manage','Change system settings','system',''),
  ('audit.view','View audit logs','system','')
on conflict (code) do nothing;

-- role -> permission matrix
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where (r.code = 'student' and p.code in ('courses.view'))
   or (r.code = 'coach'   and p.code in ('courses.view','courses.manage','lessons.manage',
        'lessons.present','students.view','tools.manage','resources.manage',
        'questions.answer','announcements.manage','sessions.manage'))
   or (r.code = 'manager' and p.code in ('courses.view','courses.manage','lessons.manage',
        'students.view','students.manage','students.access','batches.manage','tools.manage',
        'resources.manage','questions.answer','announcements.manage','sessions.manage'))
   or (r.code = 'owner')
on conflict do nothing;

insert into public.student_learning_levels (code, name, description, rank, requires_approval) values
  ('level_1','Level 1 — Beginner Foundations',
   'For students with little or no VA experience. Practical, beginner-friendly skills.',1,false),
  ('level_2','Level 2 — Job-Ready Specialization',
   'Choose a specialization and practise client-ready execution.',2,true),
  ('level_3','Level 3 — Advanced Skills',
   'Advanced and technical training. Unlocked by a Manager or Owner.',3,true)
on conflict (code) do nothing;

insert into public.specializations (slug, name, description, icon, sort_order) values
  ('general-admin','General Administrative VA','Inbox, calendar, files, data and day-to-day client support.','ClipboardList',1),
  ('marketing-assistant','Marketing Assistant','Support campaigns, content calendars and marketing reporting.','Megaphone',2),
  ('social-media','Social Media Assistant','Plan, schedule and monitor social content for clients.','Share2',3),
  ('graphic-content','Graphic and Content Editing Assistant','Canva graphics, short-form video edits and brand-consistent assets.','Palette',4),
  ('research','Research Assistant','Structured research, source checking and clear summaries.','Search',5),
  ('lead-generation','Lead Generation Assistant','Build and verify accurate prospect lists.','Target',6),
  ('customer-service','Customer Service Assistant','Handle tickets, live chat and customer follow-up.','Headphones',7),
  ('email-marketing','Email Marketing Assistant','Build campaigns, segments and simple automations.','Mail',8),
  ('crm','CRM Assistant','Keep contact data, pipelines and records clean.','Contact',9),
  ('marketing-automation','Marketing Automation Assistant','Build and maintain simple marketing workflows.','Workflow',10),
  ('wordpress','WordPress and Website Support Assistant','Update pages, posts and basic site maintenance.','Globe',11),
  ('digital-ads','Digital Advertising Assistant','Prepare ad drafts and reports from approved instructions.','BarChart3',12)
on conflict (slug) do nothing;

insert into public.tool_categories (slug, name, sort_order) values
  ('workspace','Workspace and Email',1),
  ('design','Design and Video',2),
  ('communication','Communication',3),
  ('project','Project Management',4),
  ('productivity','Productivity',5),
  ('crm-automation','CRM and Automation',6),
  ('email-marketing','Email Marketing',7),
  ('website','Website',8),
  ('lead-gen','Lead Generation',9),
  ('advertising','Advertising',10),
  ('support','Customer Support',11)
on conflict (slug) do nothing;

insert into public.resource_types (slug, name, icon, sort_order) values
  ('youtube','YouTube video','Youtube',1),
  ('loom','Loom recording','Video',2),
  ('vimeo','Vimeo video','Video',3),
  ('drive','Google Drive folder','FolderOpen',4),
  ('gdoc','Google Doc','FileText',5),
  ('gsheet','Google Sheet','Table',6),
  ('gslides','Google Slides','Presentation',7),
  ('canva','Canva template','Palette',8),
  ('pdf','PDF','FileText',9),
  ('document','Document','FileText',10),
  ('spreadsheet','Spreadsheet','Table',11),
  ('image','Image','Image',12),
  ('screenshot','Screenshot','Camera',13),
  ('checklist','Checklist','ListChecks',14),
  ('template','Template','LayoutTemplate',15),
  ('swipe-file','Swipe file','Files',16),
  ('report','Report','BarChart3',17),
  ('client-brief','Client brief','Briefcase',18),
  ('sop','SOP','BookOpen',19),
  ('help-article','Help-centre article','LifeBuoy',20),
  ('documentation','Official documentation','Book',21),
  ('zoom-recording','Zoom recording','Video',22),
  ('website','External website','Link',23)
on conflict (slug) do nothing;

-- ------------------------------ tools ------------------------------------
insert into public.tools (slug, name, category_id, description, website_url, login_url, signup_url,
                          pricing_label, recommended_use, level, last_reviewed_at)
select v.slug, v.name, tc.id, v.description, v.website, v.login, v.signup, v.pricing, v.use_case,
       v.level::learning_level, current_date
from (values
 ('gmail','Gmail','workspace','Client email, labels, filters and templates.','https://mail.google.com','https://mail.google.com','https://accounts.google.com/signup','Free','Daily inbox management for clients.','level_1'),
 ('google-drive','Google Drive','workspace','Shared file storage and folder structure.','https://drive.google.com','https://drive.google.com','https://accounts.google.com/signup','Freemium','Store and organise client files.','level_1'),
 ('google-docs','Google Docs','workspace','Documents, SOPs and drafts.','https://docs.google.com','https://docs.google.com','https://accounts.google.com/signup','Free','Write SOPs and content drafts.','level_1'),
 ('google-sheets','Google Sheets','workspace','Trackers, lists and simple reports.','https://sheets.google.com','https://sheets.google.com','https://accounts.google.com/signup','Free','Build trackers and lead lists.','level_1'),
 ('google-calendar','Google Calendar','workspace','Scheduling and reminders.','https://calendar.google.com','https://calendar.google.com','https://accounts.google.com/signup','Free','Manage client calendars.','level_1'),
 ('canva','Canva','design','Graphics, presentations and simple video.','https://www.canva.com','https://www.canva.com/login','https://www.canva.com/signup','Freemium','Create social graphics from brand templates.','level_1'),
 ('capcut','CapCut','design','Short-form video editing with captions.','https://www.capcut.com','https://www.capcut.com/login','https://www.capcut.com/signup','Freemium','Edit reels and short client videos.','level_1'),
 ('slack','Slack','communication','Team and client messaging.','https://slack.com','https://slack.com/signin','https://slack.com/get-started','Freemium','Day-to-day client communication.','level_1'),
 ('zoom','Zoom','communication','Video meetings and recordings.','https://zoom.us','https://zoom.us/signin','https://zoom.us/signup','Freemium','Attend class and client calls.','level_1'),
 ('google-meet','Google Meet','communication','Browser-based video meetings.','https://meet.google.com','https://meet.google.com','https://accounts.google.com/signup','Free','Quick client calls.','level_1'),
 ('trello','Trello','project','Kanban boards for simple workflows.','https://trello.com','https://trello.com/login','https://trello.com/signup','Freemium','Track client tasks visually.','level_1'),
 ('asana','Asana','project','Task and project tracking.','https://asana.com','https://app.asana.com','https://asana.com/create-account','Freemium','Manage recurring client work.','level_1'),
 ('clickup','ClickUp','project','Docs, tasks and dashboards.','https://clickup.com','https://app.clickup.com/login','https://clickup.com/signup','Freemium','All-in-one client workspace.','level_2'),
 ('monday','Monday.com','project','Visual work management.','https://monday.com','https://auth.monday.com/auth/login_monday','https://monday.com/pricing','Paid','Client project boards.','level_2'),
 ('notion','Notion','productivity','Notes, wikis and lightweight databases.','https://www.notion.so','https://www.notion.so/login','https://www.notion.so/signup','Freemium','Build a personal VA knowledge base.','level_1'),
 ('jira','Jira','project','Issue tracking for technical teams.','https://www.atlassian.com/software/jira','https://id.atlassian.com/login','https://www.atlassian.com/software/jira/free','Freemium','Support technical client teams.','level_3'),
 ('calendly','Calendly','productivity','Booking links and scheduling rules.','https://calendly.com','https://calendly.com/login','https://calendly.com/signup','Freemium','Let clients book time without back-and-forth.','level_1'),
 ('loom','Loom','communication','Screen recordings and async updates.','https://www.loom.com','https://www.loom.com/login','https://www.loom.com/signup','Freemium','Record walkthroughs for clients.','level_1'),
 ('grammarly','Grammarly','productivity','Writing and tone checks.','https://www.grammarly.com','https://account.grammarly.com/signin','https://www.grammarly.com/signup','Freemium','Proofread client emails.','level_1'),
 ('chatgpt','ChatGPT','productivity','Drafting, summarising and idea generation.','https://chat.openai.com','https://chat.openai.com/auth/login','https://chat.openai.com/auth/login','Freemium','Draft first versions, then edit carefully.','level_1'),
 ('hubspot','HubSpot','crm-automation','CRM, deals and marketing tools.','https://www.hubspot.com','https://app.hubspot.com/login','https://www.hubspot.com/products/get-started','Freemium','Manage contacts and pipelines.','level_2'),
 ('activecampaign','ActiveCampaign','email-marketing','Email marketing and automation.','https://www.activecampaign.com','https://www.activecampaign.com/login','https://www.activecampaign.com/pricing','Paid','Build campaigns and automations.','level_2'),
 ('mailchimp','Mailchimp','email-marketing','Newsletters, audiences and templates.','https://mailchimp.com','https://login.mailchimp.com','https://login.mailchimp.com/signup','Freemium','Send and report on newsletters.','level_2'),
 ('gohighlevel','GoHighLevel','crm-automation','Agency CRM, funnels and automation.','https://www.gohighlevel.com','https://app.gohighlevel.com','https://www.gohighlevel.com','Paid','Run agency client workflows.','level_3'),
 ('keap','Keap','crm-automation','CRM with sales automation.','https://keap.com','https://accounts.infusionsoft.com','https://keap.com/pricing','Paid','Small-business CRM support.','level_3'),
 ('zapier','Zapier','crm-automation','Connect apps without code.','https://zapier.com','https://zapier.com/app/login','https://zapier.com/sign-up','Freemium','Automate repetitive handoffs.','level_3'),
 ('make','Make','crm-automation','Visual automation scenarios.','https://www.make.com','https://www.make.com/en/login','https://www.make.com/en/register','Freemium','Build multi-step automations.','level_3'),
 ('wordpress','WordPress','website','Websites, pages and posts.','https://wordpress.org','https://wordpress.com/log-in','https://wordpress.com/start','Freemium','Update client pages and posts.','level_2'),
 ('elementor','Elementor','website','Drag-and-drop WordPress page builder.','https://elementor.com','https://my.elementor.com/login','https://elementor.com/pricing','Freemium','Edit landing pages safely.','level_2'),
 ('apollo','Apollo','lead-gen','Prospect search and contact data.','https://www.apollo.io','https://app.apollo.io/#/login','https://www.apollo.io/sign-up','Freemium','Build targeted lead lists.','level_2'),
 ('sales-navigator','LinkedIn Sales Navigator','lead-gen','Advanced LinkedIn prospect search.','https://business.linkedin.com/sales-solutions/sales-navigator','https://www.linkedin.com/login','https://business.linkedin.com/sales-solutions/sales-navigator','Paid','Find decision makers by filters.','level_2'),
 ('clay','Clay','lead-gen','Enrich and combine lead data sources.','https://www.clay.com','https://app.clay.com','https://www.clay.com','Paid','Enrich lead lists at scale.','level_3'),
 ('hunter','Hunter','lead-gen','Find and verify work email addresses.','https://hunter.io','https://hunter.io/users/sign_in','https://hunter.io/users/sign_up','Freemium','Find contact emails.','level_2'),
 ('neverbounce','NeverBounce','lead-gen','Email list verification.','https://www.neverbounce.com','https://app.neverbounce.com/login','https://app.neverbounce.com/signup','Paid','Clean lists before sending.','level_2'),
 ('zerobounce','ZeroBounce','lead-gen','Email validation and scoring.','https://www.zerobounce.net','https://www.zerobounce.net/members/login','https://www.zerobounce.net/members/register','Freemium','Reduce bounce rates.','level_2'),
 ('meta-business-suite','Meta Business Suite','advertising','Manage Facebook and Instagram assets.','https://business.facebook.com','https://business.facebook.com','https://business.facebook.com','Free','Schedule posts and check inbox.','level_1'),
 ('meta-ads-manager','Meta Ads Manager','advertising','Create and review Meta ad campaigns.','https://adsmanager.facebook.com','https://adsmanager.facebook.com','https://www.facebook.com/business/tools/ads-manager','Free','Prepare campaign drafts for approval.','level_2'),
 ('google-ads','Google Ads','advertising','Search and display advertising.','https://ads.google.com','https://ads.google.com','https://ads.google.com/start','Free','Review campaigns, ad groups and keywords.','level_2'),
 ('zendesk','Zendesk','support','Ticketing and help centre.','https://www.zendesk.com','https://www.zendesk.com/login','https://www.zendesk.com/register','Paid','Handle customer tickets.','level_2'),
 ('freshdesk','Freshdesk','support','Support ticketing.','https://freshdesk.com','https://freshdesk.com/login','https://freshdesk.com/signup','Freemium','Manage a shared support inbox.','level_2'),
 ('intercom','Intercom','support','Live chat and customer messaging.','https://www.intercom.com','https://app.intercom.com/admins/sign_in','https://www.intercom.com/pricing','Paid','Answer live chat conversations.','level_2'),
 ('help-scout','Help Scout','support','Shared inbox for small teams.','https://www.helpscout.com','https://secure.helpscout.net/members/login','https://www.helpscout.com/signup','Paid','Reply from a shared client inbox.','level_2')
) as v(slug,name,cat,description,website,login,signup,pricing,use_case,level)
join public.tool_categories tc on tc.slug = v.cat
on conflict (slug) do nothing;

insert into public.branding_settings (id) values (1) on conflict (id) do nothing;

insert into public.system_settings (key, value, description, is_private) values
  ('enrollment_open','true','Allow Managers to enrol new students.',false),
  ('default_time_zone','Asia/Manila','Default time zone for new accounts.',false),
  ('support_hours','Mon-Fri, 9am-6pm PHT','Shown on the student help panel.',false),
  ('level2_auto_eligibility','true','Mark students eligible for Level 2 once Level 1 is complete.',false),
  ('level3_requires_owner','false','Require Owner approval for every Level 3 grant.',true),
  ('session_retention_days','365','How long Zoom recordings stay linked.',true)
on conflict (key) do nothing;
