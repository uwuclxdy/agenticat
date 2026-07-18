# Security-Requirement Extraction: Templates

## Templates

### Template 1: Security Requirement Model

**Security domains** (10): authentication, authorization, data protection, audit logging,
input validation, error handling, session management, cryptography, network security,
availability.

**Compliance frameworks** (7): PCI-DSS, HIPAA, GDPR, SOC2, NIST CSF, ISO 27001, OWASP.

A security requirement carries: id, title, description, requirement type (functional /
non-functional / constraint), domain, priority (critical / high / medium / low), rationale,
acceptance criteria, test cases, `threat_refs`, `compliance_refs`. Trace threats to
requirements through `threat_refs`.

### Template 2: Threat-to-Requirement Extractor

Map each STRIDE category to its security domains, then draft one requirement per pattern with
matching acceptance criteria and test cases. Priority = impact × likelihood banding (use the
risk matrix in `references/stride.md`). Ids run `SR-001`, `SR-002`, ... `{target}` is the
threatened component.

| STRIDE | Domains | Example requirement | Example acceptance criterion | Example test |
|---|---|---|---|---|
| Spoofing | authentication, session management | "Implement strong authentication for {target}" | users authenticate before accessing {target} | unauthenticated access to {target} is denied |
| Tampering | input validation, data protection | "Validate all input to {target}" | all input to {target} is validated | invalid input to {target} is rejected |
| Repudiation | audit logging | "Log all security events for {target}" | actions on {target} logged with user identity | security events are logged |
| Information disclosure | data protection, cryptography | "Encrypt sensitive data in {target}" | sensitive data in {target} is encrypted | {target} data is encrypted in transit and at rest |
| Denial of service | availability, input validation | "Implement rate limiting for {target}" | rate limiting enforced on {target} | rate limiting on {target} works correctly |
| Elevation of privilege | authorization | "Enforce authorization for {target}" | authorization checked for all {target} operations | unauthorized access to {target} is denied |

### Template 3: Compliance Mapping

Map a requirement to controls by its domain. Control ids anchored to **PCI DSS v4.0.1** and
**OWASP ASVS 5.0** (chapter-level); PCI DSS v3.2.1 and ASVS 4.0 numbering are retired.

| Framework | Domain | Control ids |
|---|---|---|
| PCI DSS v4.0.1 | authentication | 8.2, 8.3, 8.4 |
| PCI DSS v4.0.1 | authorization | 7.2, 7.3 |
| PCI DSS v4.0.1 | data protection | 3.4, 3.5.1, 4.2.1 |
| PCI DSS v4.0.1 | audit logging | 10.2, 10.3 |
| PCI DSS v4.0.1 | network security | 1.2, 1.3, 1.4 |
| PCI DSS v4.0.1 | cryptography | 3.6, 3.7, 4.2.1 |
| HIPAA | authentication | 164.312(d) |
| HIPAA | authorization | 164.312(a)(1) |
| HIPAA | data protection | 164.312(a)(2)(iv), 164.312(e)(2)(ii) |
| HIPAA | audit logging | 164.312(b) |
| GDPR | data protection | Art. 32, Art. 25 |
| GDPR | audit logging | Art. 30 |
| GDPR | authorization | Art. 25 |
| OWASP ASVS 5.0 | authentication | V6 |
| OWASP ASVS 5.0 | session management | V7 |
| OWASP ASVS 5.0 | input validation | V1, V2 |
| OWASP ASVS 5.0 | cryptography | V11 |
| OWASP ASVS 5.0 | error handling | V16 |
| OWASP ASVS 5.0 | data protection | V14 |
| OWASP ASVS 5.0 | audit logging | V16 |

No control-id mapping table exists for SOC2, NIST CSF, or ISO 27001. Template 1 lists them as
recognized frameworks, not as ones with ready-made control ids.

Gap analysis: a control with no mapped requirement is a missing control; one with a single
mapped requirement is weak coverage.
