# Threat-Mitigation Mapping: Templates and Worked Examples

## Templates

### Template 1: Mitigation Model

**Control types:** preventive, detective, corrective.

**Control layers:** network, application, data, endpoint, process, physical.

**Effectiveness scale:** none 0, low 1, medium 2, high 3, very-high 4.

**Implementation status**, and the weight each carries toward coverage: not-implemented 0,
partial 0.5, implemented 0.8, verified 1.0. Active = any status past not-implemented.

A control reaches `verified` only when a test exercised it and the control actually blocked or
detected the attack. Presence, a config review, or a vendor claim is `implemented`.

Each control carries: id, name, type, layer, effectiveness, implementation + maintenance cost,
status, the threats it mitigates, dependencies, technologies, and `compliance_refs`.

Effectiveness and status describe a deployment, not a control type, so the seed library below
carries neither column; assign both per system at modeling time.

A threat's controls have a **gap** when any of these hold (count only active controls, i.e.
status past not-implemented):

- weighted coverage < 50%: add controls or strengthen existing ones
- fewer than 2 distinct layers: no defense in depth; add controls at other layers
- no preventive **and** detective control both present: not covered

Weighted coverage: each active control has strength `effectiveness × status weight / 4`, so a
verified very-high control is 1.0 and an implemented medium one is 0.4. Coverage =
`(1 - product of (1 - strength)) × 100`, each control cutting into what the others leave. No
active control scores 0%. Do not average the strengths instead: averaging lets an added layer
drop the score, which puts this check at war with the 2-layer check above.

### Template 2: Control Library

Standard controls. Compliance ids anchored to **PCI DSS v4.0.1** and **OWASP ASVS 5.0**
(both current editions; PCI DSS v3.2.1 retired 2024-03-31, ASVS 4.0 superseded by 5.0 in 2025).

| ID | Name | Type | Layer | Mitigates | Compliance refs | Technologies |
|---|---|---|---|---|---|---|
| AUTH-001 | Multi-Factor Authentication | preventive | application | Spoofing | PCI DSS 8.4, 8.5; NIST SP 800-63B-4 | TOTP, WebAuthn, SMS OTP |
| AUTH-002 | Account Lockout Policy | preventive | application | Spoofing | PCI DSS 8.3.4 | custom |
| VAL-001 | Input Validation Framework | preventive | application | Tampering | OWASP ASVS V1, V2 | Joi, Yup, Pydantic |
| VAL-002 | Web Application Firewall | preventive | network | Tampering, Denial of service | PCI DSS 6.4.1, 6.4.2 | AWS WAF, Cloudflare, ModSecurity |
| VAL-003 | Parameterized Queries | preventive | application | Tampering | PCI DSS 6.2.4; OWASP ASVS V1.2 | prepared statements, ORM query builders |
| ENC-001 | Data Encryption at Rest | preventive | data | Information disclosure | PCI DSS 3.5.1; GDPR Art. 32 | AES-256, KMS, HSM |
| ENC-002 | TLS Encryption | preventive | network | Information disclosure, Tampering | PCI DSS 4.2.1; HIPAA | TLS 1.3, certificate management |
| LOG-001 | Security Event Logging | detective | application | Repudiation | PCI DSS 10.2; SOC2 | ELK Stack, Splunk, CloudWatch |
| LOG-002 | Log Integrity Protection | preventive | data | Repudiation, Tampering | PCI DSS 10.3 | immutable storage, log signing |
| ACC-001 | Role-Based Access Control | preventive | application | Elevation of privilege, Information disclosure | PCI DSS 7.2.2; SOC2 | RBAC, ABAC, policy engines |
| AVL-001 | Rate Limiting | preventive | application | Denial of service | OWASP API Security | API gateway, Redis, token bucket |
| AVL-002 | DDoS Protection | preventive | network | Denial of service | NIST CSF | Cloudflare, AWS Shield, Akamai |

AUTH-002 lockout under PCI DSS v4.0.1 8.3.4: lock out after not more than 10 attempts, for a
minimum of 30 minutes or until the user's identity is confirmed.

VAL-003 is the primary control for any injection threat; VAL-001 and VAL-002 sit behind it as
defense in depth, never as a substitute.

LOG-001's Mitigates column names Repudiation because that is what logging prevents, but as a
detective control it covers any threat whose attempts surface in the log: injection errors,
failed logins, privilege changes. It is the seed list's only detective control and the gap
check demands one per threat, so a real model adds its own (anomaly detection, integrity
monitoring, egress monitoring).
