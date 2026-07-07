---
name: systematic-problem-solving
description: "Get to the real problem, investigate root cause when something is broken, and principles first reasoning when choosing or rethinking an approach (design decision, inherited constraint, 'why do we even do this', stuck or ambiguous problem). Use before proposing a fix or committing to a solution."
---

# Systematic Problem Solving

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues. Solutions built on unexamined assumptions inherit every flaw of those assumptions.

**Core principle:** don't act on the surface framing. Get to the real problem or the real constraint first, then act on that.

**Violating the letter of this process is violating the spirit of it.**

## Pick your mode

| you're facing | mode | law |
|---|---|---|
| something is BROKEN: bug, test failure, unexpected behavior, perf regression, build failure | **A: Root-Cause** | no fixes without root-cause investigation first |
| you're CHOOSING or RETHINKING an approach: design decision, inherited constraint, "why do we do it this way", stuck or ambiguous problem | **B: First-Principles** | no solution before assumptions are surfaced and challenged |

The two modes hand off to each other. See **The Seam** at the end: 3+ failed fixes in Mode A means switch to Mode B; a "this used to work" discovery in Mode B means switch to Mode A.

## The Two Iron Laws

```
MODE A: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
MODE B: NO SOLUTION BEFORE ASSUMPTIONS ARE SURFACED AND CHALLENGED
```

If you haven't completed Mode A Phase 1, you cannot propose fixes. If you haven't listed and challenged the assumptions, you cannot propose a solution.

---

# Mode A: Root-Cause (something is broken)

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Someone wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   # Layer 1: Workflow
   echo "=== Secrets available in workflow: ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

   # Layer 2: Build script
   echo "=== Env vars in build script: ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"

   # Layer 3: Signing script
   echo "=== Keychain state: ==="
   security list-keychains
   security find-identity -v

   # Layer 4: Actual signing
   codesign --sign "$IDENTITY" --verbose=4 "$APP"
   ```

   **This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim, read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State it: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `test-driven-development` skill for writing proper failing tests

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: STOP and switch to Mode B (question the architecture, step 5 below)**
   - DON'T attempt Fix #4 without an architectural discussion

5. **If 3+ Fixes Failed: Switch to Mode B**

   **Pattern indicating an architectural problem:**
   - Each fix reveals new shared state/coupling/problem in a different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   This is NOT a failed hypothesis. This is a wrong architecture. Stop fixing symptoms and go to **Mode B** to challenge the assumptions the current design rests on. Discuss with the user before attempting more fixes.

## Red Flags: STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** switch to Mode B (see Phase 4, step 5).

### Signals from the user that you're off-track

**Watch for these redirections:**
- "Is that not happening?" → you assumed without verifying
- "Will it show us...?" → you should have added evidence gathering
- "Stop guessing" → you're proposing fixes without understanding
- "Ultra-think this" → question fundamentals, not just symptoms (Mode B)
- "We're stuck?" (frustrated) → your approach isn't working

**When you see these:** STOP. Return to Phase 1, or switch to Mode B.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Switch to Mode B, don't fix again. |

## Quick Reference (Mode A)

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals the issue is environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

---

# Mode B: First-Principles (choosing or rethinking an approach)

## When to Use

- A constraint is presented as fixed ("we have to do it this way", "that's not possible", "it's always been like this")
- You're choosing between competing designs or approaches
- The current approach keeps fighting you and no single fix settles it (you arrived here from Mode A, Phase 4.5)
- The problem statement itself smells wrong, or is a proposed solution wearing a problem's costume

## The Iron Law

State and challenge every assumption before proposing a solution. Reasoning from analogy, convention, or inherited assumption carries every flaw of the thing you copied.

### Step 1: Define the problem precisely

Strip the solution framing. State the actual problem, not a fix in disguise.
- Weak: "we need a faster cache"
- Strong: "reads for key X take 400ms; the budget is 50ms"

### Step 2: Surface every assumption

List each assumption baked into the current framing:
- Technical ("it has to be a database round-trip")
- Process ("the user must sign up before seeing value")
- Cost/economic ("we're billed per call so batching is mandatory")
- User ("users want the configurability")

### Step 3: Challenge each, with a verdict

For each assumption, ask:
- Is it actually true?
- What evidence supports it?
- What happens if it's reversed?
- Who decided it was necessary? Does that still hold?

Tag each assumption: **valid / invalid / partial.**

### Step 4: Keep the fundamental truths

What remains once the invalid assumptions are dropped?
- Hard technical or physical constraints
- Real requirements (not stated preferences)
- Economic realities
- Irreducible facts about the domain

### Step 5: Rebuild from the truths

Starting only from what survived Step 4:
- What's the simplest thing that satisfies just those truths?
- What becomes possible once the dropped assumptions are gone?
- What would a fresh build with no legacy do?

**Illustration:** battery cost. Instead of accepting "batteries are expensive because they always have been", price the raw materials on commodity markets and build up from there. The assumption was the price, not the physics.

## Three moves that keep Mode B honest

1. **Force a "do nothing" option.** What actually breaks if you ship nothing or wait? Sometimes that is the answer, at zero cost.
2. **Score options on four axes.** Rate each direction on:
   - impact (how much of the real problem it removes)
   - effort (cost to build)
   - risk (what goes wrong if it's wrong)
   - reversibility (can you undo it cheaply?)

   Under uncertainty, a reversible option beats an irreversible one of equal payoff.
3. **Write success and failure criteria BEFORE you build.** State which result would prove the choice right and which would prove it wrong. Pre-registering the bar stops post-hoc rationalization.

## Output (Mode B)

Deliver:
1. Problem restated in first-principles terms
2. Assumptions, each with a verdict (valid / invalid / partial)
3. The fundamental truths that survived
4. 2-3 rebuilt directions with tradeoffs and reversibility noted
5. Recommended next step, plus the success/failure criteria you'll judge it by

---

# The Seam: the two modes hand off

- **Mode A → Mode B:** 3+ fixes failed and each one moved the problem somewhere new. The design is wrong, not the code. Switch to Mode B and challenge the assumptions the current approach rests on.
- **Mode B → Mode A:** while challenging assumptions you find "this used to work" or "it works over there". That's a regression or an environment difference, not a design flaw. Switch to Mode A and trace the root cause.

Both modes share one spine: the presented framing is a symptom. Investigate past it before you commit.

## Supporting Techniques

Part of Mode A, available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through the call stack to the original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **`test-driven-development`** - For creating the failing test case (Mode A, Phase 4, Step 1)
- **`verification-before-completion`** - Verify the fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: near zero vs common
