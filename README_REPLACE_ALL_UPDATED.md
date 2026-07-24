# VA Success Academy Consolidated Updated Replacement Patch

This patch consolidates the latest V2.17, V2.18, V2.19 and V2.20 replacement files and includes the AnnouncementsPage build fix.

## Apply
1. Back up your project folder.
2. Extract this ZIP into the root of your current VA-training-Hub project.
3. Choose Replace for matching files. Do not delete other project files.
4. Run the migrations in order if not already run:
   - 0011_level_access_engine_fix.sql
   - 0012_upgrade_request_badge.sql
   - 0013_owner_delete_permissions.sql
   - 0014_course_import_engine.sql
5. In the project terminal run:

```bash
npm install
npm run dev
npm run build
```

`npm install` adds JSZip and updates package-lock.json on your computer. Do not run `npm audit fix --force`.

## What the announcement fix does
The Owner delete action is now connected to the announcement modal and confirmation dialog. It keeps the V2.19 delete feature instead of removing it, while resolving the unused TypeScript declarations that blocked the build.

## Build verification
The user's local build reached only four TypeScript errors in AnnouncementsPage after JSZip installed. Those four declarations are now actively used. A full build could not be independently completed in the packaging environment because dependency installation timed out, so no independent successful-build claim is made. Run `npm run build` locally after replacement.
