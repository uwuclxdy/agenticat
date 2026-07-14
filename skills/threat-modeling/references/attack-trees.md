# Attack-Tree Construction: Templates and Worked Example

## Templates

### Template 1: Attack Tree Data Model

**Node types:** `OR` (any child suffices), `AND` (all children required), `LEAF` (concrete
attack step). A tree carries a name, description, root node, and version.

**Leaf score axes** (higher = harder / costlier / louder):

| Axis | Scale |
|---|---|
| difficulty | trivial 1, low 2, medium 3, high 4, expert 5 |
| cost | free 0, low 1, medium 2, high 3, very-high 4 |
| detection risk | none 0, low 1, medium 2, high 3, certain 4 |

Each leaf also carries `time_hours` (float), `requires_insider` / `requires_physical` (bool),
and optional `mitigations` and `cve_refs` lists.

**Worked example — account-takeover tree** (leaf attrs as difficulty/cost/detection):

- **G1 Take Over User Account** (OR)
  - **S1 Steal Credentials** (OR)
    - A1 Phishing Attack (LEAF) — low/low/medium — mit: security-awareness training, email filtering
    - A2 Credential Stuffing (LEAF) — trivial/low/high — mit: rate limiting, MFA, password-breach monitoring
    - A3 Keylogger Malware (LEAF) — medium/medium/medium — mit: endpoint protection, MFA
  - **S2 Bypass Authentication** (OR)
    - A4 Session Hijacking (LEAF) — medium/low/low — mit: secure session management, HTTPS only
    - A5 Authentication Bypass Vulnerability (LEAF) — high/low/low — mit: security testing, code review, WAF
  - **S3 Social Engineering** (OR)
    - **S3.1 Account Recovery Attack** (AND)
      - A6 Gather Personal Information (LEAF) — low/free/none
      - A7 Call Support Desk (LEAF) — medium/free/medium — mit: support verification procedures, security questions

### Template 2: Attack Path Analysis

Enumerate root-to-leaf paths (OR branches into one path per child; AND takes the cartesian
product of its children's sub-paths), then score each path: sum cost / difficulty / time over
its leaves, count leaves as steps, carry `requires_insider` / `requires_physical` if any leaf
needs them. Coverage % = paths with any mitigated leaf / total paths; prioritize the leaves
that appear in the most paths (highest coverage impact first).

Rank paths by the axis that matches the adversary being modeled: cheapest (opportunistic),
easiest (lowest total difficulty, commodity skill), or stealthiest (lowest detection risk, the
patient adversary). Default to cheapest, and rank by stealthiest as well whenever the model
includes an attacker who will pay more to stay unseen; the two rarely pick the same path.

Deliberate: detection risk is scored as the worst single leaf (max), not summed — one loud
step exposes the whole path, unlike cost/difficulty which accumulate per path.
