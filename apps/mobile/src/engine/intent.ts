/**
 * Lightweight intent detection for the on-device/LAN auto-router.
 *
 * No ML — just rules. The LAN backend has the full-quality classifier; this
 * version only exists to make "auto" routing pick the right side cheaply.
 */

const BLOCKCHAIN_RE =
  /\b(?:wallet|balance|wallet\s+address|qr\s+code|crypto|blockchain|on-?chain|transaction|tx\s+hash|0g|ethereum|evm|gas\s+fee|airdrop|stake|staking|nft)\b/i;

const CODE_FENCE_RE = /```[\s\S]+?```|\bimplement\b|\bfunction\b|\bclass\b/i;

// Message is long or has multiple questions → prefer the stronger (LAN) model.
function isComplex(message: string): boolean {
  if (message.length > 400) return true;
  const questionMarks = (message.match(/\?/g) ?? []).length;
  if (questionMarks >= 3) return true;
  if (CODE_FENCE_RE.test(message)) return true;
  return false;
}

function isSimple(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 160) return false;
  const words = trimmed.split(/\s+/).length;
  return words <= 30;
}

export type RouteHint = 'force-lan' | 'prefer-lan' | 'prefer-local' | 'neutral';

export interface IntentAnalysis {
  hint: RouteHint;
  reasons: string[];
}

export function analyzeIntent(message: string): IntentAnalysis {
  const reasons: string[] = [];
  if (BLOCKCHAIN_RE.test(message)) {
    reasons.push('blockchain intent — on-device cannot hit 0G RPC');
    return { hint: 'force-lan', reasons };
  }
  if (isComplex(message)) {
    reasons.push('long/complex — LAN has the larger model');
    return { hint: 'prefer-lan', reasons };
  }
  if (isSimple(message)) {
    reasons.push('short/casual — on-device is faster');
    return { hint: 'prefer-local', reasons };
  }
  return { hint: 'neutral', reasons };
}
