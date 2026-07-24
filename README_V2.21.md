# V2.21 Graded Quiz and Skill-Gap Recommendations

## Copy these files

Copy the patch into the project root and replace matching files only:

- `src/App.tsx`
- `src/pages/CourseDetailPage.tsx`
- `src/pages/QuizPage.tsx`
- `supabase/migrations/0015_graded_quiz_skill_gaps.sql`

This patch requires the earlier V2.20 Course Import Engine migration (`0014`) to already be applied.

## Supabase

Create a new SQL Editor query, paste the full contents of:

`supabase/migrations/0015_graded_quiz_skill_gaps.sql`

Run it once.

## Local commands

```bash
npm install
npm run dev
npm run build
```

## Imported graded quiz JSON

```json
{
  "title": "Module 1 Quiz",
  "description": "Check your understanding.",
  "passing_percentage": 80,
  "maximum_attempts": 3,
  "allow_retake": true,
  "show_correct_answers": true,
  "required_for_completion": true,
  "questions": [
    {
      "question": "What should a VA do first when instructions are unclear?",
      "type": "multiple_choice",
      "skill_tag": "client_communication",
      "related_lesson_slug": "asking-clear-client-questions",
      "points": 1,
      "choices": [
        { "text": "Guess and continue", "correct": false },
        { "text": "Ask a clear follow-up question", "correct": true },
        { "text": "Ignore the task", "correct": false }
      ],
      "explanation": "Clarify unclear instructions before proceeding."
    }
  ]
}
```

True/false questions use `"type": "true_false"` and two choices.

## Test as Student

1. Open an accessible course containing an imported quiz.
2. Confirm the quiz appears under **Graded assessments**.
3. Start the quiz and confirm correct answers are not visible.
4. Submit a passing attempt and verify score, percentage, pass status, explanations, and answer review.
5. Submit a failing attempt and verify weak skill tags and linked lesson recommendations.
6. Confirm required unanswered questions block submission.
7. Confirm a submitted attempt cannot be edited.
8. Confirm retakes respect `allow_retake` and `maximum_attempts`.
9. Confirm a required failed quiz prevents the calculated course result from passing.

## Test staff roles

- **Owner:** Can manage quiz records under the existing Owner database permissions and import graded quizzes through Course Import.
- **Manager/Coach:** Can read quiz attempts and results under existing staff permissions.
- **Student:** Can access only published quizzes for courses they can access and can view only their own attempts/results.
- Correct choices are returned only after server-side grading when `show_correct_answers` is enabled.

## Build verification

`npm install` was attempted in the packaging environment but dependency downloads did not finish within the available command window. `npm run build` was attempted and could not compile because React, React Router, Lucide, and Node type packages were not installed. A successful build is not claimed.
