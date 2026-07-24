# V2.20 Course Import Engine Patch

## Included files

- `src/pages/staff/BuilderPage.tsx`
- `src/lib/courseImport.ts`
- `supabase/migrations/0014_course_import_engine.sql`
- `package.json`

This patch does not replace the full project and does not modify authentication, the access engine, level access, or upgrade requests.

## Apply the patch

1. Extract this ZIP.
2. Copy each replacement file into the matching path in the latest VA Success Academy project.
3. Keep all existing files and migrations, including V2.17, V2.18, and V2.19.
4. In Supabase, open **SQL Editor** and run the complete contents of:

   `supabase/migrations/0014_course_import_engine.sql`

5. In the project terminal, run:

```bash
npm install
npm run dev
npm run build
```

The patch adds `jszip` to `package.json`, so `npm install` is required.

## Use the importer

1. Sign in as **Owner**.
2. Open **Course Builder**.
3. Click **Import ZIP**.
4. Select a structured course ZIP.
5. Review the detected course, module, lesson, resource, and assessment counts.
6. Click **Import course**.
7. Select the newly imported course in Course Builder and verify its modules and lessons.

## Supported package structure

Required:

- `course.json`
- `modules.json`
- `lessons.json`
- every Markdown file referenced by `lessons.json`

Optional:

- `resources/resources.json`
- `quizzes/*.json`
- `assignments/assignments.json`
- `final-assessment.json`

Nested root folders inside the ZIP are supported.

## Safety behavior

- Import is Owner-only in both the interface and Supabase RPC.
- The browser does not provide a user ID or role to the RPC.
- Existing courses are not overwritten.
- A duplicate course slug stops the import.
- The database import runs as one transaction. If a record fails, the course is not partially imported.
- Quizzes and assignments are preserved in `course_import_assessments` as JSON for later assessment-player integration.
- Missing resource files remain as path placeholders; no URL is invented.

## Current package note

Courses 2–6 use the supported structured format. The current Course 1 starter ZIP is still an outline package and does not contain the same complete JSON/Markdown lesson structure.

## Build verification

`npm install` was attempted in the build environment but timed out while downloading dependencies. `npm run build` was then attempted and failed because React, React Router, Lucide, Node types, and the new JSZip dependency were not installed. A successful build is not claimed.
