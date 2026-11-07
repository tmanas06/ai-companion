/**
 * Hard-coded replies for pleasantries and small-talk fillers.
 *
 * The ai-router checks these FIRST so trivial turns answer instantly, never
 * fail, and don't burn model time/battery. Patterns are anchored to the full
 * normalized message (lowercase, trimmed, trailing punctuation stripped), so a
 * substring match inside a real query like "hey check my wallet" will NOT be
 * intercepted — only messages that are essentially just a greeting.
 *
 * Add patterns freely. Each entry is tried in order; the first match wins.
 * A random reply from `replies` is returned to avoid monotony.
 */

export interface CannedEntry {
  id: string;
  patterns: RegExp[];
  replies: string[];
}

const CANNED: CannedEntry[] = [
  {
    id: 'greeting',
    patterns: [
      /^(hi|hello|hey+|hiya|howdy|yo|sup|hola|greetings|aloha|namaste|morning|good morning|good afternoon|good evening)$/i,
    ],
    replies: [
      "Hey — good to see you. What's on your mind?",
      "Hi there. How can I help today?",
      'Hello! What would you like to talk about?',
      "Hey. I'm here — tell me what you need.",
    ],
  },
  {
    id: 'how_are_you',
    patterns: [
      /^(how are (you|u|ya)|how r u|how('?s)? it going|how('?s)? things|how goes it|hru|wyd|how have you been|whats up|what'?s up|how('?s)? your day)$/i,
    ],
    replies: [
      "I'm doing well, thanks for asking. How about you?",
      "Running smoothly on your side of the network. How are you doing?",
      "All good here. What's going on with you?",
    ],
  },
  {
    id: 'reply_good',
    patterns: [
      /^(i'?m (good|fine|great|okay|ok|well|alright)|good|fine|great|okay|ok|not bad|all good|doing well|pretty good|same here)$/i,
    ],
    replies: [
      'Glad to hear it. Anything you want to chat about?',
      "Nice. Want to dive into something, or just hang out?",
      'Cool — what should we work on?',
    ],
  },
  {
    id: 'thanks',
    patterns: [
      /^(thanks|thank you|thx|ty|tysm|cheers|much appreciated|appreciate it|great thanks|thanks a lot|thanks so much)$/i,
    ],
    replies: [
      "You're welcome.",
      'Anytime.',
      'Happy to help.',
      "No problem at all.",
    ],
  },
  {
    id: 'farewell',
    patterns: [
      /^(bye+|goodbye|cya|see you|see ya|later|good night|gn|gnight|take care|peace|farewell|adios|ttyl|catch you later)$/i,
    ],
    replies: [
      "Take care. I'll be here when you're back.",
      'Bye for now.',
      "See you later — I'll remember where we left off.",
    ],
  },
  {
    id: 'identity',
    patterns: [
      /^(who are you|what('?s)? your name|whats your name|what are you|tell me about yourself|introduce yourself)$/i,
    ],
    replies: [
      "I'm AETHRA — your private AI companion. I run on your device, remember what you tell me, and never send anything to a server you don't control.",
      "AETHRA. I live on this phone, remember what matters to you, and chat without needing the cloud.",
    ],
  },
  {
    id: 'capabilities',
    patterns: [
      /^(what can you do|help|what do you do|how can you help|what are you capable of|what('?s)? your deal)$/i,
    ],
    replies: [
      "I can chat, remember what you share with me, and when you're online I can also check your 0G wallet. Everything runs locally unless you ask for something that needs the network.",
      "Chat, remember things, voice input, and blockchain wallet checks. All on-device except the wallet part — that needs the network.",
    ],
  },
  {
    id: 'apology',
    patterns: [
      /^(sorry|my bad|apologies|oops|excuse me|pardon|my apologies)$/i,
    ],
    replies: [
      "No worries. What's on your mind?",
      "All good. What did you want to say?",
      "It's fine — go on.",
    ],
  },
  {
    id: 'laugh',
    patterns: [
      /^(lol+|lmao+|rofl|haha+|hehe+|hah+|ha+|xd)$/i,
    ],
    replies: [
      '😄 glad that landed.',
      '🙂',
      'Hah.',
    ],
  },
  {
    id: 'yes',
    patterns: [
      /^(yes|yeah|yep|yup|yessir|yea|sure|ok|okay|alright|sounds good|for sure|absolutely)$/i,
    ],
    replies: [
      'Got it.',
      'Alright, what next?',
      'Cool.',
    ],
  },
  {
    id: 'no',
    patterns: [
      /^(no|nope|nah|not really|not now|maybe later|never mind|nevermind|cancel)$/i,
    ],
    replies: [
      'No problem.',
      "Okay, no pressure. I'm here when you want.",
      'Got it.',
    ],
  },
];

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, ' ')
    .replace(/[.!?,;:"']+$/g, '')
    .trim();
}

export interface CannedMatch {
  id: string;
  reply: string;
}

/**
 * Returns a canned reply for pleasantries, or null for real queries.
 * Skips messages longer than 40 chars outright — those deserve real inference.
 */
export function matchCanned(message: string): CannedMatch | null {
  if (!message) return null;
  const normalized = normalize(message);
  if (!normalized) return null;
  if (normalized.length > 40) return null;

  for (const entry of CANNED) {
    for (const re of entry.patterns) {
      if (re.test(normalized)) {
        const reply = entry.replies[Math.floor(Math.random() * entry.replies.length)];
        return { id: entry.id, reply };
      }
    }
  }
  return null;
}
