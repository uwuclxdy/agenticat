---
name: threat-modeling
description: "Threat modeling with STRIDE, attack trees, security-requirement extraction, mitigation and control-library selection (defense-in-depth), and compliance mapping (PCI-DSS/HIPAA/GDPR/OWASP-ASVS). Use when doing a security review, choosing mitigating controls, hardening a design, or building a threat-model doc."
metadata:
  author: uwuclxdy
  version: "1.4"
---

# Threat Modeling

This threat-models a system's components and data flows, not its code. Pick the one reference the task needs; don't load all four.

| Task | File |
|---|---|
| Identify threats per component/interaction (STRIDE questionnaires, DFD trust-boundary analysis, threat-model doc template) | `references/stride.md` |
| Map attack paths (OR/AND node model, path + coverage analysis, worked account-takeover example) | `references/attack-trees.md` |
| Turn threats into requirements (STRIDE -> requirement patterns, compliance mapping with PCI-DSS/HIPAA/GDPR/OWASP-ASVS control IDs; SOC2/NIST CSF/ISO 27001 have no control-id table) | `references/requirements.md` |
| Choose and prioritize controls (standard-controls library, defense-in-depth layering, coverage + gap analysis) | `references/mitigations.md` |

## Core Model

STRIDE categories and the property each violates:

| Threat | Property violated |
|---|---|
| Spoofing | Authentication |
| Tampering | Integrity |
| Repudiation | Non-repudiation |
| Information disclosure | Confidentiality |
| Denial of service | Availability |
| Elevation of privilege | Authorization |

Attack trees: root = attacker goal; OR nodes (any child suffices), AND nodes (all children required), leaves = concrete attack steps scored by difficulty, cost, and detection risk. Cheapest complete path = priority defense target.

Control categories, in layering order: preventive (stop), detective (notice), corrective (recover). Deterrent and compensating controls sit outside that order. A threat counts as covered only when both a preventive control and a detective control apply.

## Workflow

1. Define scope and trust boundaries.
2. Draw the data flow diagram (flows and boundaries, not just components).
3. Identify assets and entry points.
4. Apply STRIDE per element and per interaction (`references/stride.md`).
5. Build attack trees for the critical paths (`references/attack-trees.md`).
6. Score and prioritize (likelihood × impact).
7. Extract requirements and map controls (`references/requirements.md`, `references/mitigations.md`).
8. Document residual risks; revisit when components, trust boundaries, or data flows change.

The reference tables and templates are material to read and adapt per session, not a library to install.

## Gotchas

- `references/requirements.md` Template 1 names 7 compliance frameworks, but Template 3's control-id mapping table only covers PCI DSS, HIPAA, GDPR, and OWASP ASVS. SOC2, NIST CSF, and ISO 27001 have no control-id table anywhere in this skill.

## Delegating

For a standalone modeling run, if the `threat-modeler` agent is installed, spawn it; otherwise follow the Workflow above directly.
