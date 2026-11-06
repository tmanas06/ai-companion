"""Conversational emotion analysis service for AI Companion avatar expressions."""

import re
from typing import Tuple

BOUNDED_EMOTIONS = {
    "neutral",
    "happy",
    "empathetic",
    "sad",
    "surprised",
    "curious",
    "confused",
    "laughing",
    "reassuring",
}


def sanitize_emotion(emotion_label: str) -> str:
    """Normalize and validate emotion label against bounded canonical set."""
    if not emotion_label:
        return "neutral"
    clean = emotion_label.strip().lower()
    if clean in BOUNDED_EMOTIONS:
        return clean
    # Map common synonyms to bounded canonical emotions
    synonym_map = {
        "joy": "happy",
        "excited": "happy",
        "cheerful": "happy",
        "proud": "happy",
        "encouraging": "happy",
        "compassionate": "empathetic",
        "caring": "empathetic",
        "sympathetic": "empathetic",
        "sorrow": "sad",
        "grieving": "sad",
        "melancholy": "sad",
        "amazed": "surprised",
        "astonished": "surprised",
        "inquisitive": "curious",
        "intrigued": "curious",
        "thoughtful": "curious",
        "puzzled": "confused",
        "perplexed": "confused",
        "amused": "laughing",
        "funny": "laughing",
        "playful": "laughing",
        "soothing": "reassuring",
        "calming": "reassuring",
        "supportive": "reassuring",
    }
    return synonym_map.get(clean, "neutral")


def analyze_conversational_emotion(user_text: str, reply_text: str) -> Tuple[str, float]:
    """
    Intelligently infer an appropriate subtle emotion from conversational context and reply meaning.
    
    Returns:
        (emotion, intensity) where emotion is in BOUNDED_EMOTIONS and intensity is float 0.1..1.0.
    """
    u = (user_text or "").lower()
    r = (reply_text or "").lower()

    # 1. Empathetic: Grief, loss, pain, illness, tough hardship
    # Critical: Even if the reply is supportive, when user shares grief, avatar must be empathetic
    loss_patterns = [
        r"\blost someone\b", r"\bpassed away\b", r"\bdied\b", r"\bgrief\b",
        r"\bhurt\b", r"\bsad\b", r"\bdepressed\b", r"\bcrying\b", r"\bhard time\b",
        r"\bsorry for your loss\b", r"\bmy condolences\b", r"\bhere for you\b",
        r"\bthat sounds really painful\b", r"\bheartbreaking\b"
    ]
    if any(re.search(pat, u) or re.search(pat, r) for pat in loss_patterns):
        return ("empathetic", 0.85)

    # 2. Reassuring: Anxiety, worry, fear, stress, self-doubt
    anxiety_patterns = [
        r"\banxious\b", r"\bstressed\b", r"\bworried\b", r"\bpanic\b",
        r"\bafraid\b", r"\bscared\b", r"\boverwhelmed\b", r"\bdeep breath\b",
        r"\beverything will be alright\b", r"\byou're doing great\b", r"\btake your time\b"
    ]
    if any(re.search(pat, u) or re.search(pat, r) for pat in anxiety_patterns):
        return ("reassuring", 0.75)

    # 3. Laughing: Jokes, humorous banter, funny anecdotes
    humor_patterns = [
        r"\bhaha\b", r"\blol\b", r"\blmao\b", r"\bchuckle\b",
        r"\bthat's hilarious\b", r"\bcracks me up\b", r"\btoo funny\b",
        r"\bjoking\b", r"\bjust kidding\b"
    ]
    if any(re.search(pat, u) or re.search(pat, r) for pat in humor_patterns):
        return ("laughing", 0.8)

    # 4. Happy: Achievements, good news, celebration, joy
    achievement_patterns = [
        r"\bgot the job\b", r"\bpromoted\b", r"\bcongratulations\b", r"\bcelebrate\b",
        r"\bwonderful news\b", r"\bfantastic\b", r"\bso proud\b", r"\bawesome\b",
        r"\bi did it\b", r"\bsucceeded\b", r"\bhooray\b", r"\bhappy\b", r"\bthrilled\b"
    ]
    if any(re.search(pat, u) or re.search(pat, r) for pat in achievement_patterns):
        return ("happy", 0.85)

    # 5. Surprised: Unexpected revelations, shock, amazement
    surprise_patterns = [
        r"\bwow\b", r"\bunbelievable\b", r"\bno way\b", r"\bseriously\?\b",
        r"\bshocking\b", r"\bincredible\b", r"\bastonishing\b"
    ]
    if any(re.search(pat, u) or re.search(pat, r) for pat in surprise_patterns):
        return ("surprised", 0.7)

    # 6. Confused: Paradoxes, misunderstandings, contradictions
    confused_patterns = [
        r"\bwhat do you mean\b", r"\bi don't understand\b", r"\bdoesn't make sense\b",
        r"\bconfused\b", r"\bpuzzling\b", r"\bwait, what\?\b"
    ]
    if any(re.search(pat, u) for pat in confused_patterns):
        return ("confused", 0.65)

    # 7. Curious / Inquisitive: Questions, explanations, exploring ideas
    if "?" in u or "tell me about" in u or "can you explain" in u or "how does" in u:
        return ("curious", 0.6)

    # 8. Default: Attentive, natural conversational neutral
    return ("neutral", 0.5)
