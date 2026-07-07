---
name: threat-modeling
description: Threat modeling with STRIDE, attack trees, security-requirement extraction, and mitigation/control mapping. Use for security reviews and hardening.
---

# Threat modeling

Architecture-level threat analysis. Pick the one reference the task needs; don't load all four.

| Task | File |
|---|---|
| Identify threats per component/interaction (STRIDE questionnaires, DFD trust-boundary analysis, threat-model doc template) | `references/stride.md` |
| Map attack paths (OR/AND node model, tree builder, Mermaid/PlantUML export, path + coverage analysis) | `references/attack-trees.md` |
| Turn threats into requirements (STRIDE→requirement patterns, compliance mapping with PCI-DSS/HIPAA/GDPR/OWASP-ASVS control IDs, user-story generation) | `references/requirements.md` |
| Choose and prioritize controls (standard-controls library, defense-in-depth layering, budget-constrained selection, roadmap) | `references/mitigations.md` |

## Core model

STRIDE categories and the property each violates:

| Threat | Property violated |
|---|---|
| Spoofing | Authentication |
| Tampering | Integrity |
| Repudiation | Non-repudiation |
| Information disclosure | Confidentiality |
| Denial of service | Availability |
| Elevation of privilege | Authorization |

Attack trees: root = attacker goal; OR nodes (any child suffices), AND nodes (all children required), leaves = concrete attack steps with cost/skill/likelihood attributes. Cheapest complete path = priority defense target.

Control categories, in layering order: preventive (stop), detective (notice), corrective (recover), plus deterrent and compensating. A threat is covered when at least one preventive AND one detective control apply.

## Workflow

1. Define scope and trust boundaries.
2. Draw the data flow diagram (flows and boundaries, not just components).
3. Identify assets and entry points.
4. Apply STRIDE per element and per interaction (`references/stride.md`).
5. Build attack trees for the critical paths (`references/attack-trees.md`).
6. Score and prioritize (likelihood × impact).
7. Extract requirements and map controls (`references/requirements.md`, `references/mitigations.md`).
8. Document residual risks; revisit on architecture changes.

The python classes in the references are templates to read and adapt per session, not a library to install.

## Delegating

For a standalone modeling run, spawn the `threat-modeling-expert` agent. It re-reads this skill every run; the workflow above stays the only copy of the method.
