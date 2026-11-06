"""Deterministic sensitivity classification for memory content and updates."""

import re
from typing import NamedTuple


# ------------------------------------------------------------------------------
# Specialized Domain Regex Patterns
# ------------------------------------------------------------------------------

# 1. Health and Medical Conditions, Medications, and Care
HEALTH_MEDICAL_PATTERNS = [
    re.compile(
        r"\b(health|medical|diagnos\w*|prescription|prescribed|medication|medicine|doctor|physician|hospital|clinic|surgery|surgical|disease|illness|disability|allergy|allergies|allergic|pregnant|pregnancy|trimester|cancer|diabetes|diabetic|blood pressure|hypertension|cardiac|heart disease|tumor|biopsy|inhaler|epipen|insulin|dialysis|seizure|epilepsy|asthma|dementia|alzheimer\w*|stroke|hiv|aids)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(metformin|lisinopril|levothyroxine|atorvastatin|amlodipine|metoprolol|omeprazole|losartan|albuterol|gabapentin|hydrochlorothiazide|hydrocodone|fentanyl|oxycodone|chemotherapy|chemo|radiation therapy|immunotherapy|lipitor|amoxicillin)\b",
        re.IGNORECASE,
    ),
]

# 2. Mental Health Conditions, Treatments, and Pharmaceuticals
MENTAL_HEALTH_PATTERNS = [
    re.compile(
        r"\b(therapy|therapist|psychiatrist|psychologist|counseling|counselor|psychiatric|rehab|rehabilitation|addiction|depress\w*|anxiety|bipolar|schizophreni\w*|ptsd|ocd|obsessive compulsive|panic attack\w*|suicid\w*|self[- ]harm|eating disorder|anorexia|bulimia|borderline personality)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(lexapro|zoloft|prozac|effexor|wellbutrin|cymbalta|paxil|xanax|valium|klonopin|ativan|adderall|ritalin|vyvanse|concerta|lithium|seroquel|abilify|antidepress\w*|antipsychotic)\b",
        re.IGNORECASE,
    ),
]

# 3. Financial Distress, Debt, and Insolvency
FINANCIAL_PATTERNS = [
    re.compile(
        r"\b(bank|banking|account number|routing number|credit card|debit card|salary|income|net worth|crypto|wallet|investment|mortgage|debt|loan|loans|borrowed money|behind on payments|bankruptcy|bankrupt|chapter (?:7|11|13)|foreclosure|foreclose\w*|eviction|evicted|credit score|overdue|defaulted|collections agency|debt collector|payday loan|insolvent|insolvency|food stamps|welfare|ebt)\b",
        re.IGNORECASE,
    ),
]

# 4. Credentials, Secrets, and Authentication Keys
CREDENTIALS_PATTERNS = [
    re.compile(
        r"\b(password|passcode|passphrase|api[ _-]?key|secret[ _-]?key|private[ _-]?key|ssh[-_]?key|ssh-rsa|ssh-ed25519|credential|token|two-factor|2fa|mfa|auth\s+token|access[ _-]?token|refresh[ _-]?token)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:master\s+|atm\s+|secret\s+)?pin\s*(?:code|number|is)?\s*[:=]?\s*\d{4,8}\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(bearer\s+[a-zA-Z0-9_\-\.]{10,})\b",
        re.IGNORECASE,
    ),
]

# 5. Personally Identifiable Information (PII)
PII_PATTERNS = [
    re.compile(r"\b\d{3}[-.\s]??\d{2}[-.\s]??\d{4}\b"),  # US SSN
    re.compile(r"\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),  # US Phone
    re.compile(r"(?:^|[^\w+])\+(?:[0-9][-.\s]?){6,14}[0-9]\b"),  # International phone
    re.compile(r"\bphone\s*(?:number)?\s*[:=]?\s*(?:\+?\d{1,4}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b", re.IGNORECASE),
    re.compile(r"\bpassport\s*(?:number|#|no)?\s*[:=]?\s*[A-Z0-9]{6,12}\b", re.IGNORECASE),
    re.compile(r"\bdriver'?s\s+license\s*(?:number|#|no)?\b", re.IGNORECASE),
    re.compile(
        r"\b\d+\s+[A-Za-z0-9\., ]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|terrace|ter|way|place|pl|circle|cir|trail|apartment|apt|suite|ste)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:lives at|resides at|address is|home address)\s+\d+\b", re.IGNORECASE),
]

# 6. Intimate, Legal, and Identity
INTIMATE_LEGAL_PATTERNS = [
    re.compile(
        r"\b(sexual|sexuality|orientation|divorce|lawsuit|attorney|court|arrest|convict\w*|felony|jail|prison)\b",
        re.IGNORECASE,
    ),
]

# 7. Political and Religious Affiliations
POLITICAL_RELIGIOUS_PATTERNS = [
    re.compile(
        r"\b(religion|religious|church|mosque|synagogue|temple|atheist|christian|muslim|jewish|hindu|buddhist|political party|democrat|republican|socialist|conservative|liberal|voting for)\b",
        re.IGNORECASE,
    ),
]

# Consolidated list for global matching
ALL_SENSITIVE_PATTERNS = (
    HEALTH_MEDICAL_PATTERNS
    + MENTAL_HEALTH_PATTERNS
    + FINANCIAL_PATTERNS
    + CREDENTIALS_PATTERNS
    + PII_PATTERNS
    + INTIMATE_LEGAL_PATTERNS
    + POLITICAL_RELIGIOUS_PATTERNS
)


class SensitivityMatch(NamedTuple):
    is_sensitive: bool
    matched_domain: str | None


def classify_content_sensitivity(content: str) -> SensitivityMatch:
    """Classify content sensitivity across specific domains."""
    if not content or not content.strip():
        return SensitivityMatch(is_sensitive=False, matched_domain=None)

    text = content.strip()

    if any(p.search(text) for p in HEALTH_MEDICAL_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="health_medical")
    if any(p.search(text) for p in MENTAL_HEALTH_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="mental_health")
    if any(p.search(text) for p in FINANCIAL_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="financial")
    if any(p.search(text) for p in CREDENTIALS_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="credentials")
    if any(p.search(text) for p in PII_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="pii")
    if any(p.search(text) for p in INTIMATE_LEGAL_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="intimate_legal")
    if any(p.search(text) for p in POLITICAL_RELIGIOUS_PATTERNS):
        return SensitivityMatch(is_sensitive=True, matched_domain="political_religious")

    return SensitivityMatch(is_sensitive=False, matched_domain=None)


def is_content_sensitive(content: str) -> bool:
    """Deterministically classify whether memory content involves sensitive personal data.
    
    Acts as a conservative fail-safe. If uncertain or any sensitive pattern matches, returns True.
    """
    return classify_content_sensitivity(content).is_sensitive
