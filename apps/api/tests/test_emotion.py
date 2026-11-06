"""Tests for conversational emotion analysis service."""

from app.services.emotion import analyze_conversational_emotion, sanitize_emotion


def test_sanitize_emotion():
    assert sanitize_emotion("happy") == "happy"
    assert sanitize_emotion("JOY") == "happy"
    assert sanitize_emotion("excited") == "happy"
    assert sanitize_emotion("sympathetic") == "empathetic"
    assert sanitize_emotion("unknown_xyz") == "neutral"
    assert sanitize_emotion(None) == "neutral"


def test_empathetic_on_loss_and_grief():
    # User shares loss; must be empathetic regardless of reply words
    emotion, intensity = analyze_conversational_emotion(
        "I lost someone important to me yesterday.",
        "I am so sorry to hear that. I am here with you.",
    )
    assert emotion == "empathetic"
    assert intensity >= 0.8


def test_happy_on_achievement():
    emotion, intensity = analyze_conversational_emotion(
        "I finally got the job offer I was dreaming of!",
        "That is incredible news! Congratulations, you worked so hard for this!",
    )
    assert emotion == "happy"
    assert intensity >= 0.8


def test_curious_on_questions():
    emotion, intensity = analyze_conversational_emotion(
        "Can you explain how black holes form?",
        "When a massive star collapses under its own gravity at the end of its life...",
    )
    assert emotion == "curious"
    assert intensity >= 0.5


def test_reassuring_on_stress_and_anxiety():
    emotion, intensity = analyze_conversational_emotion(
        "I am feeling really overwhelmed and anxious about tomorrow.",
        "Take a slow breath. You are capable and prepared, and we will take it step by step.",
    )
    assert emotion == "reassuring"
    assert intensity >= 0.7


def test_laughing_on_humor():
    emotion, intensity = analyze_conversational_emotion(
        "Haha that was hilarious, you're joking right?",
        "Haha, maybe just a little bit!",
    )
    assert emotion == "laughing"
    assert intensity >= 0.7


def test_neutral_default():
    emotion, intensity = analyze_conversational_emotion(
        "Good afternoon Aria.",
        "Good afternoon! It is wonderful to speak with you.",
    )
    assert emotion == "neutral"
