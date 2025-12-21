"""Protected Health Information (PHI) detection.

Detects potential PHI in text before sending to AI providers, supporting
HIPAA compliance for healthcare research applications.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Pattern


class PHIType(str, Enum):
    """Types of PHI that can be detected."""
    SSN = "ssn"
    MRN = "mrn"
    PHONE = "phone"
    EMAIL = "email"
    DATE_OF_BIRTH = "date_of_birth"
    CREDIT_CARD = "credit_card"
    IP_ADDRESS = "ip_address"
    NAME = "name"  # Requires NER, not regex


@dataclass
class PHIFinding:
    """A detected PHI occurrence in text.

    Attributes:
        type: The type of PHI detected
        start: Starting character position in text
        end: Ending character position in text
        text: The matched text (may be redacted in logs)
        confidence: Confidence score (1.0 for regex matches)
    """
    type: PHIType
    start: int
    end: int
    text: str
    confidence: float = 1.0


@dataclass
class PHIDetectionResult:
    """Result of PHI detection on text.

    Attributes:
        has_phi: Whether any PHI was detected
        findings: List of PHI findings
        redacted_text: Text with PHI replaced by [REDACTED]
    """
    has_phi: bool
    findings: List[PHIFinding] = field(default_factory=list)
    redacted_text: Optional[str] = None

    @property
    def phi_types(self) -> List[str]:
        """Get unique PHI types found."""
        return list(set(f.type.value for f in self.findings))


class PHIDetector:
    """Detect and optionally redact PHI in text.

    Uses regex patterns for common PHI formats. For more sophisticated
    name detection, can be extended with NER models.

    Example:
        ```python
        detector = PHIDetector()

        result = await detector.detect("Patient SSN: 123-45-6789")
        if result.has_phi:
            print(f"Found PHI types: {result.phi_types}")
            # ['ssn']

        redacted = await detector.redact("Call me at 555-123-4567")
        # "Call me at [REDACTED]"
        ```
    """

    # Regex patterns for common PHI formats
    # These are intentionally conservative to minimize false negatives
    PATTERNS: dict[PHIType, Pattern] = {
        # Social Security Number: XXX-XX-XXXX
        PHIType.SSN: re.compile(
            r'\b\d{3}-\d{2}-\d{4}\b'
        ),

        # Medical Record Number: 7-9 digit numbers (common format)
        # May need customization per institution
        PHIType.MRN: re.compile(
            r'\b(?:MRN|mrn|Medical Record|medical record)[:\s#]*(\d{7,9})\b',
            re.IGNORECASE
        ),

        # Phone numbers: Various US formats
        PHIType.PHONE: re.compile(
            r'\b(?:\+1[-.\s]?)?'  # Optional +1 country code
            r'(?:\(?\d{3}\)?[-.\s]?)?'  # Optional area code
            r'\d{3}[-.\s]?\d{4}\b'  # Core number
        ),

        # Email addresses
        PHIType.EMAIL: re.compile(
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        ),

        # Dates that could be DOB: MM/DD/YYYY, MM-DD-YYYY, etc.
        # Only flags dates with context words suggesting DOB
        PHIType.DATE_OF_BIRTH: re.compile(
            r'\b(?:DOB|dob|birth|born|birthday)[:\s]*'
            r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b',
            re.IGNORECASE
        ),

        # Credit card numbers: 13-19 digits with optional separators
        PHIType.CREDIT_CARD: re.compile(
            r'\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b'
        ),

        # IP addresses (v4)
        PHIType.IP_ADDRESS: re.compile(
            r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}'
            r'(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'
        ),
    }

    # Patterns that are likely false positives
    EXCLUSION_PATTERNS: List[Pattern] = [
        re.compile(r'\b\d{3}-\d{4}\b'),  # Partial phone (no area code)
        re.compile(r'\b(?:v|version)\s*\d+\.\d+\.\d+\b', re.IGNORECASE),  # Version numbers
    ]

    def __init__(
        self,
        enabled_types: Optional[List[PHIType]] = None,
        custom_patterns: Optional[dict[str, Pattern]] = None,
    ):
        """Initialize the PHI detector.

        Args:
            enabled_types: PHI types to detect (all by default)
            custom_patterns: Additional custom regex patterns
        """
        self.enabled_types = enabled_types or list(PHIType)
        self.custom_patterns = custom_patterns or {}

        # Remove NAME from enabled types if present (requires NER)
        if PHIType.NAME in self.enabled_types:
            self.enabled_types.remove(PHIType.NAME)

    async def detect(self, text: str) -> PHIDetectionResult:
        """Detect potential PHI in text.

        Args:
            text: Text to scan for PHI

        Returns:
            PHIDetectionResult with findings
        """
        if not text:
            return PHIDetectionResult(has_phi=False)

        findings: List[PHIFinding] = []

        # Check each enabled pattern
        for phi_type in self.enabled_types:
            if phi_type not in self.PATTERNS:
                continue

            pattern = self.PATTERNS[phi_type]
            for match in pattern.finditer(text):
                # Check if match is excluded
                if self._is_excluded(text, match.start(), match.end()):
                    continue

                findings.append(PHIFinding(
                    type=phi_type,
                    start=match.start(),
                    end=match.end(),
                    text=match.group(),
                    confidence=1.0,
                ))

        # Check custom patterns
        for pattern_name, pattern in self.custom_patterns.items():
            for match in pattern.finditer(text):
                if self._is_excluded(text, match.start(), match.end()):
                    continue

                findings.append(PHIFinding(
                    type=PHIType.SSN,  # Use SSN as generic custom type
                    start=match.start(),
                    end=match.end(),
                    text=match.group(),
                    confidence=0.9,  # Slightly lower for custom
                ))

        # Sort by position
        findings.sort(key=lambda f: f.start)

        return PHIDetectionResult(
            has_phi=len(findings) > 0,
            findings=findings,
        )

    async def redact(self, text: str, replacement: str = "[REDACTED]") -> str:
        """Replace detected PHI with a placeholder.

        Args:
            text: Text to redact
            replacement: String to replace PHI with

        Returns:
            Text with PHI replaced
        """
        if not text:
            return text

        result = await self.detect(text)

        if not result.has_phi:
            return text

        # Sort findings by position descending to replace from end
        # (preserves position indices during replacement)
        sorted_findings = sorted(
            result.findings,
            key=lambda f: f.start,
            reverse=True
        )

        redacted = text
        for finding in sorted_findings:
            redacted = (
                redacted[:finding.start] +
                replacement +
                redacted[finding.end:]
            )

        return redacted

    def _is_excluded(self, text: str, start: int, end: int) -> bool:
        """Check if a match should be excluded as a false positive.

        Args:
            text: Full text
            start: Match start position
            end: Match end position

        Returns:
            True if this match should be excluded
        """
        matched_text = text[max(0, start - 20):min(len(text), end + 20)]

        for pattern in self.EXCLUSION_PATTERNS:
            if pattern.search(matched_text):
                return True

        return False

    async def detect_and_decide(
        self,
        text: str,
        policy: str = "warn",
    ) -> tuple[PHIDetectionResult, str]:
        """Detect PHI and return processed text based on policy.

        Args:
            text: Text to process
            policy: "block", "warn", or "redact"

        Returns:
            Tuple of (detection result, processed text)

        Raises:
            AIPHIDetectedError: If policy is "block" and PHI is found
        """
        from researchhub.ai.exceptions import AIPHIDetectedError

        result = await self.detect(text)

        if not result.has_phi:
            return result, text

        if policy == "block":
            raise AIPHIDetectedError(result.phi_types)
        elif policy == "redact":
            redacted = await self.redact(text)
            result.redacted_text = redacted
            return result, redacted
        else:  # warn
            return result, text
