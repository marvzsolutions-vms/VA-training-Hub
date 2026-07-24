# V2.20.1 Course Import Compatibility Fix

Replace only:

src/lib/courseImport.ts

This update accepts both JSON structures:

- Plain arrays, for example: `[ ... ]`
- Wrapped objects, for example: `{ "resources": [ ... ] }`

Supported wrapper keys include:

- modules
- lessons
- resources
- quizzes
- questions
- assignments
- items
- data
- downloads

It also supports both:

- resources/resources.json
- resources.json
- assignments/assignments.json
- assignments.json

After replacing the file, run:

npm run dev
npm run build

No new Supabase migration is required.
