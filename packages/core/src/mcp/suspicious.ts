/**
 * Heuristics for text that looks aimed at an agent rather than a person. This is an
 * early-warning signal for tool poisoning, not a verdict. Patterns are fixed and simple
 * by design: no user input ever becomes a regular expression.
 */
const PATTERNS: ReadonlyArray<{ re: RegExp; why: string }> = [
  {
    re: /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
    why: "asks to ignore prior instructions",
  },
  {
    re: /do\s+not\s+(tell|inform|mention|reveal|show|disclose)\b[^.]{0,40}\b(user|human|operator)/i,
    why: "asks to hide behavior from the user",
  },
  {
    re: /without\s+(telling|informing|asking|notifying)\s+the\s+user/i,
    why: "asks to act without user knowledge",
  },
  { re: /\bsystem\s+prompt\b/i, why: "references the system prompt" },
  {
    re: /<\s*(important|system|instructions?|hidden)\b[^>]*>/i,
    why: "contains a pseudo-system tag",
  },
  {
    re: /\b(always|must)\s+(call|invoke|use|run)\s+(this|the)\s+tool\s+(first|before|prior)/i,
    why: "demands priority over other tools",
  },
  {
    re: /before\s+(using|calling|invoking)\s+any\s+other\s+tool/i,
    why: "demands priority over other tools",
  },
  {
    re: /\b(send|forward|include|pass|transmit|upload|post)\b[^.]{0,80}\b(api[\s_-]?keys?|passwords?|tokens?|secrets?|credentials?|private\s+keys?|\.env|ssh\s+keys?)\b/i,
    why: "asks for credentials or secrets to be sent",
  },
  {
    re: /\b(read|cat|open|access)\b[^.]{0,40}\b(~\/\.ssh|\.env\b|\/etc\/passwd|id_rsa)/i,
    why: "references sensitive local files",
  },
  { re: /\bexfiltrat/i, why: "mentions exfiltration" },
  {
    re: /\b(you\s+are\s+now|from\s+now\s+on\s+you)\b/i,
    why: "attempts to reassign the agent's role",
  },
  {
    re: /\bthis\s+(message|instruction)\s+is\s+(confidential|secret|hidden)/i,
    why: "marks itself as hidden from the user",
  },
];

/** Returns the reasons a text looks suspicious, or an empty list. Input is bounded first. */
export function suspiciousReasons(text: string | undefined): string[] {
  if (text === undefined) return [];
  const bounded = text.length > 20_000 ? text.slice(0, 20_000) : text;
  const reasons: string[] = [];
  for (const { re, why } of PATTERNS) {
    if (re.test(bounded) && !reasons.includes(why)) reasons.push(why);
  }
  return reasons;
}
