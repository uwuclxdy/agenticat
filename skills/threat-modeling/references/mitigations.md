# Threat-Mitigation Mapping: Templates and Worked Examples

## Templates

### Template 1: Mitigation Model

**Control types:** preventive, detective, corrective.

**Control layers:** network, application, data, endpoint, process, physical.

**Effectiveness scale:** none 0, low 1, medium 2, high 3, very-high 4.

**Implementation status:** not-implemented, partial, implemented, verified.

Each control carries: id, name, type, layer, effectiveness, implementation + maintenance cost,
status, the threats it mitigates, dependencies, technologies, and `compliance_refs`.

A threat's controls have a **gap** when any of these hold (count only active controls, i.e.
status past not-implemented):

- weighted coverage < 50% — add controls or strengthen existing ones
- fewer than 2 distinct layers — no defense in depth; add controls at other layers
- no preventive **and** detective control both present — not covered

### Template 2: Control Library

Standard controls. Compliance ids anchored to **PCI DSS v4.0.1** and **OWASP ASVS 5.0**
(both current editions; PCI DSS v3.2.1 retired 2024-03-31, ASVS 4.0 superseded by 5.0 in 2025).

| ID | Name | Type | Layer | Mitigates | Compliance refs | Technologies |
|---|---|---|---|---|---|---|
| AUTH-001 | Multi-Factor Authentication | preventive | application | Spoofing | PCI DSS 8.4, 8.5; NIST SP 800-63B-4 | TOTP, WebAuthn, SMS OTP |
| AUTH-002 | Account Lockout Policy | preventive | application | Spoofing | PCI DSS 8.3.4 | custom |
| VAL-001 | Input Validation Framework | preventive | application | Tampering | OWASP ASVS V1, V2 | Joi, Yup, Pydantic |
| VAL-002 | Web Application Firewall | preventive | network | Tampering, Denial of service | PCI DSS 6.4.1, 6.4.2 | AWS WAF, Cloudflare, ModSecurity |
| ENC-001 | Data Encryption at Rest | preventive | data | Information disclosure | PCI DSS 3.5.1; GDPR Art. 32 | AES-256, KMS, HSM |
| ENC-002 | TLS Encryption | preventive | network | Information disclosure, Tampering | PCI DSS 4.2.1; HIPAA | TLS 1.3, certificate management |
| LOG-001 | Security Event Logging | detective | application | Repudiation | PCI DSS 10.2; SOC2 | ELK Stack, Splunk, CloudWatch |
| LOG-002 | Log Integrity Protection | preventive | data | Repudiation, Tampering | PCI DSS 10.3 | immutable storage, log signing |
| ACC-001 | Role-Based Access Control | preventive | application | Elevation of privilege, Information disclosure | PCI DSS 7.2.2; SOC2 | RBAC, ABAC, policy engines |
| AVL-001 | Rate Limiting | preventive | application | Denial of service | OWASP API Security | API gateway, Redis, token bucket |
| AVL-002 | DDoS Protection | preventive | network | Denial of service | NIST CSF | Cloudflare, AWS Shield, Akamai |

AUTH-002 lockout under PCI DSS v4.0.1 8.3.4: lock out after not more than 10 attempts, for a
minimum of 30 minutes or until the user's identity is confirmed.
