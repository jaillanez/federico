"""Argentine phone numbers → E.164 mobile format for WhatsApp (+549 + 10 digits).

Accepts the usual ways people write them: "0264 15 5651609", "264-5651609", "+54 9 264 565-1609",
"11 15 1234-5678", "(0264) 155-651609"...
"""

import re


def normalize_ar_phone(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("54"):
        digits = digits[2:]
        if digits.startswith("9"):
            digits = digits[1:]
    digits = digits.removeprefix("0")
    if len(digits) == 12:
        # Old mobile format: area code (2-4 digits) + "15" + number.
        for area_len in (2, 3, 4):
            if digits[area_len : area_len + 2] == "15":
                digits = digits[:area_len] + digits[area_len + 2 :]
                break
    if len(digits) != 10 or digits[0] == "0":
        return None
    return f"+549{digits}"
