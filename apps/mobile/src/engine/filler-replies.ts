/**
 * Conversational filler phrases shown while the model is generating.
 *
 * Same intent as ChatGPT voice's "hmm, one moment" — bridges the dead time
 * between send and first token so the companion doesn't feel frozen.
 *
 * The chat screen schedules a filler to appear ~400ms after a message is
 * sent. If the real reply arrives within that window (fast local reply,
 * canned, etc.) the filler never appears. Otherwise it occupies the
 * companion bubble until replaced with the real reply.
 */

export type FillerCategory =
  | 'thinking'
  | 'acknowledgment'
  | 'interesting'
  | 'complex';

const POOLS: Record<FillerCategory, string[]> = {
  thinking: [
    'Let me think about that…',
    'Hmm, give me a sec…',
    'Just a moment…',
    'Thinking…',
    'One sec…',
    'Working on it…',
  ],
  acknowledgment: [
    'Sure, one sec…',
    'Got it, working on it…',
    'Okay, coming right up…',
    'On it…',
    'Alright, one moment…',
  ],
  interesting: [
    'Good question — one sec…',
    "That's interesting, let me think…",
    'Hmm, interesting. Let me work through this…',
    'Good one — give me a moment…',
  ],
  complex: [
    "This is a bigger one, bear with me…",
    'Working through it…',
    'This will take a moment, hang on…',
    'Give me a second to think this through…',
  ],
};

const COMMAND_VERB_RE =
  /^\s*(tell|show|explain|write|draft|summari[sz]e|translate|list|generate|describe|outline|compare)\b/i;

export function categorize(message: string): FillerCategory {
  if (message.length > 300) return 'complex';
  if (COMMAND_VERB_RE.test(message)) return 'acknowledgment';
  if (message.includes('?') && message.length > 20) return 'interesting';
  return 'thinking';
}

export function pickFiller(message: string): string {
  const category = categorize(message);
  const pool = POOLS[category];
  return pool[Math.floor(Math.random() * pool.length)];
}
