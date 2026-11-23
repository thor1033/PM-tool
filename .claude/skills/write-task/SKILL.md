---
name: write-task
description: How to write a task made from a meeting transcript in Teqneo Projects, so a founder can see at a glance what it is, what it delivers and who does what. Use whenever you turn a transcript into tasks. Not for tasks someone creates by hand.
---

# Writing a task from a transcript

These rules apply only to tasks generated from a meeting transcript, through
`pm_create_task_from_transcript`. Creating a task by hand in the app, or through
the plain `pm_create_task`, needs none of this: a title and a track are enough.

A transcript task is good when a founder who has never heard of it can answer
three questions without asking anyone:

1. **What is this, and why?** (`description`)
2. **What exists when it is done?** (`deliverable`)
3. **Who is part of it, and for what?** (`owner`, `involved` with `role`)

## Fields

| Field | Rule |
| --- | --- |
| `title` | The one thing to do. At most 90 characters. A verb and an object: "Choose the translation for 30 glossary terms", not "Glossary". |
| `description` | A few sentences, at most 800 characters: what the work is and why it matters. Not a transcript quote. |
| `deliverable` | At most 300 characters. The output someone can point at: a document, a decision recorded, a running feature, a signed contract. "Discuss X" is a process, not a deliverable; "A decision on X, written in the notes" is one. |
| `owner` | One person who does the work. Required. If it is unclear, ask the founders; do not leave it empty. |
| `involved` | Everyone else, each as `{ name, role }`. The role says what they contribute: "reviews the schema before release", "approves the wording". No role means they should not be on the list. |

Long background, evidence and quotes go in a **note** attached to the task
(`pm_add_note`), never in the description.

## Before creating: check for duplicates

Transcripts repeat the same topic many times, and tasks end up in both Danish
and English. So:

1. Translate the title into **both** Danish (`titleDa`) and English (`titleEn`).
2. Call `pm_find_similar_tasks` with both. It compares only open tasks;
   finished tasks are ignored.
3. If something scores about 0.5 or more, update that task instead of creating
   another, and tell the founders what you merged into.
4. When you do create, pass `titleTranslation` (the title in the other
   language) so the check runs again on both wordings. The result lists
   `possibleDuplicates`; if one is close, offer to merge.

## Example

```
title:        Choose Danish words for the 30 glossary terms
description:  The executive team reads English terms (RAG, agent, orchestration)
              that only the founders know. A plain Danish explanation per term
              lets them follow meetings and review documents.
deliverable:  A one-page glossary with a plain-language Danish explanation and
              the chosen Danish term for each of the 30 terms.
owner:        Ditlev
involved:     Thor: checks the technical explanations are correct
              A second founder: confirms the wording works for the executive team
```

## Updating

Keep all three answers true as the task changes. If the scope shifts, update
the `description` and `deliverable`, not just the title. `pm_update_task` does
not enforce any of this; the care is yours.
