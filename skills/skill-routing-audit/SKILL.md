---
name: skill-routing-audit
description: "Audits a skill for routing gaps: boundary and negative probes that land where the answer is absent."
when_to_use: "Use after authoring or editing a skill, or to sweep all skills. For description triggering, cloudify `skill.md`."
metadata:
  author: uwuclxdy
  version: "1.5"
---

# Skill Routing Audit

A skill can hold the right answer and still fail, because routing buries it. Happy-path "how do I X" questions route to the right reference. Boundary and negative questions ("can it even do X?", "what can't it do?", "is Y possible?") route to that same "how to do X" reference, which only lists what the subject can do, so the real "no" sits in another file or nowhere. The reader lands where the routing points and never sees it.

This skill hunts that failure with boundary probes and a skill-only simulation.

## When to Use

- After authoring or editing a skill, before relying on it.
- To sweep every installed skill for the same class of gap.
- When a skill that should cover a question gave a vague or wrong answer.

Not for creating a skill from scratch (cloudify `skill.md`) or folding a user's manual edit back into a skill.

Out of scope too: cross-skill misselection (the top-level router picking a different skill entirely) and pairwise overlap between competing skills. This audits burial *inside* an already-selected skill. A skill that never fires at all has a description/triggering problem; that routes to cloudify `skill.md`'s triggering guidance, not here.

## Method

Point it at a skill's directory. Audit one named skill, or every subdirectory that has a `SKILL.md`.

Fan out one read-only subagent per skill (parallel for an all-skills sweep). Each agent:

1. Read the skill's `SKILL.md`, then its reference and bundled files, to learn what it covers and what it says a user can and cannot do.
2. Derive 4 to 6 boundary/negative probes a real user would ask at the edge of the skill's scope: plausibly-impossible actions, off-limits operations, common misconceptions. Not happy-path "how do I X". Ground each in the skill's own subject.
3. Answer each probe using only this skill: start from `SKILL.md`, follow the skill's own routing table and pointers to whichever reference an agent would naturally open. Read nothing outside the skill dir; use no prior knowledge of the underlying tool.
4. Classify each probe:
   - **OK**: `SKILL.md` or the naturally-routed reference answers it confidently.
   - **ROUTING GAP**: the answer exists in the skill, but natural routing sends you to a file that lacks it. Name the wrong-turn file and where the answer actually lives.
   - **CONTENT GAP**: the answer is not anywhere in the skill.
5. Return a table: `probe | verdict | wrong-turn file | where the answer lives | one-line fix`. Read-only, edit nothing.

Merge into one punch-list grouped by skill, ROUTING and CONTENT gaps first, cleanest skills last.

## Fixing a Routing Gap

Surface the answer where the wrong routing lands. Do not relocate content:

- a gotcha bullet in `SKILL.md` (agents scan these first),
- a line in the how-to section an agent opens for that kind of request,
- a routing-table row pointing at the boundary or the reference that holds the rule.

Phrase the fix for the class, not the single probe: state what the skill's subject cannot do in general, not only the one example that surfaced it.

A CONTENT GAP needs the missing fact added to the owning reference first, then surfaced by the same three landing spots.

## Confirm the Fix

Re-run one fresh skill-only subagent (no priming, does not know the intended answer) on the failing probe. It must reach the correct answer on the first pass from `SKILL.md`, not by luck. If it still lands on the wrong file, the surfacing is not where the routing sends the reader; move it, do not add more prose elsewhere.
