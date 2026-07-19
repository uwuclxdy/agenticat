# STRIDE Analysis Patterns: Templates

## Templates

### Template 1: STRIDE Threat Model Document

Outer fence is four backticks so the nested diagram/matrix fences render.

````markdown
# Threat Model: [System Name]

## 1. System Overview

Brief description of the system and its purpose.

### Data Flow Diagram

```
[User] --> [Web App] --> [API Gateway] --> [Backend Services]
               |
               v
           [Database]
```

### Trust Boundaries
- **External**: Internet to DMZ
- **Internal**: DMZ to internal network
- **Data**: application to database

## 2. Assets

| Asset | Sensitivity | Description |
|-------|-------------|-------------|
| User credentials | High | Authentication tokens, passwords |
| Personal data | High | PII, financial information |
| Session data | Medium | Active user sessions |
| Configuration | High | System settings, secrets |

## 3. STRIDE Analysis

One table per category; each row is a threat scored by impact and likelihood
(Low/Medium/High/Critical). Draw mitigations from the control library in
`references/mitigations.md`.

### 3.1 Spoofing

| ID | Threat | Target | Impact | Likelihood |
|----|--------|--------|--------|------------|
| S1 | Session hijacking | User sessions | High | Medium |
| S2 | Credential stuffing | Login endpoint | High | High |

### 3.2 Tampering

| ID | Threat | Target | Impact | Likelihood |
|----|--------|--------|--------|------------|
| T1 | SQL injection | Database queries | Critical | High |
| T2 | Parameter manipulation | API requests | High | High |

### 3.3 Remaining Categories

Repeat one table per category for Repudiation, Information disclosure,
Denial of service, and Elevation of privilege.

## 4. Risk Assessment

### 4.1 Risk Matrix

```
                 IMPACT
             Low  Med  High  Crit
   Low        1    2    3     4
   Med        2    4    6     8
   High       3    6    9    12
   Crit       4    8   12    16
```

Rows = likelihood, columns = impact; score = impact x likelihood.

Bands: 12 and up Critical, 6 to 11 High, 3 to 5 Medium, below 3 Low.

### 4.2 Prioritized Risks

| Rank | Threat | Risk Score | Priority |
|------|--------|------------|----------|
| 1 | SQL injection (T1) | 12 | Critical |
| 2 | Credential stuffing (S2) | 9 | High |
| 3 | Parameter manipulation (T2) | 9 | High |
| 4 | Session hijacking (S1) | 6 | High |

## 5. Mitigation Plan

Sequence the work by risk score, Critical first, and run every row through the gap checks in
`references/mitigations.md` before accepting it. Record residual risk per threat, not as one
figure for the system.

| Threat | Controls | Residual risk |
|--------|----------|---------------|
| SQL injection (T1) | VAL-003, VAL-002, LOG-001 | Low: preventive and detective, across two layers |
| Credential stuffing (S2) | AUTH-001, AUTH-002, LOG-001 | Medium: every control is application-layer, so the 2-layer check still fails |
````

### Template 2: STRIDE Data Model and Questionnaires

Risk banding lives in Template 1's matrix (score = impact × likelihood); controls live in
`references/mitigations.md`. Use these six review questionnaires, one per category:

**Spoofing**
- Can an attacker impersonate a legitimate user?
- Are authentication tokens properly validated?
- Can session identifiers be predicted or stolen?
- Is multi-factor authentication available?

**Tampering**
- Can data be modified in transit?
- Can data be modified at rest?
- Are input validation controls sufficient?
- Can an attacker manipulate application logic?

**Repudiation**
- Are all security-relevant actions logged?
- Can logs be tampered with?
- Is there sufficient attribution for actions?
- Are timestamps reliable and synchronized?

**Information disclosure**
- Is sensitive data encrypted at rest?
- Is sensitive data encrypted in transit?
- Can error messages reveal sensitive information?
- Are access controls properly enforced?

**Denial of service**
- Are rate limits implemented?
- Can resources be exhausted by malicious input?
- Is there protection against amplification attacks?
- Are there single points of failure?

**Elevation of privilege**
- Are authorization checks performed consistently?
- Can users access other users' resources?
- Can privilege escalation occur through parameter manipulation?
- Is the principle of least privilege followed?

### Template 3: Data Flow Diagram Analysis

Applicable STRIDE categories per DFD element type (canonical Microsoft SDL mapping):

| Element type | Applicable STRIDE |
|---|---|
| External entity | S, R |
| Process | S, T, R, I, D, E |
| Data store | T, I, D; R (log/audit stores only) |
| Data flow | T, I, D |

Rank trust-boundary crossings by trust-level gap (widest first). Flag any unencrypted flow
that crosses a trust boundary as a priority finding.

### Template 4: STRIDE per Interaction

STRIDE threats keyed by `(source type, target type)`. Apply to each interaction between two
components:

| Source → Target | STRIDE threats |
|---|---|
| external → process | S: external entity spoofing identity to process; T: tampering with data sent to process; R: external entity denying sending data; I: data exposure during transmission; D: flooding process with requests; E: exploiting process to gain privileges |
| process → datastore | T: process tampering with stored data; R: process denying data modifications; I: unauthorized data access by process; D: process exhausting storage resources |
| process → process | S: process spoofing another process; T: tampering with inter-process data; I: data leakage between processes; D: one process overwhelming another; E: process gaining elevated access |
