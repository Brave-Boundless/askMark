/**
 * Optional reader context from the Brave & Boundless app.
 *
 * The app sends `context` with each /api/chat request: where the reader is in
 * the 45 drills (15 rules x 3) and how today's drill went. When it is present
 * and valid, a short section is added to the end of the system prompt so the
 * answer can be specific.
 *
 * The website never sends `context`. Without it (or with anything invalid),
 * buildSystemPrompt returns the base prompt unchanged, byte for byte, so the
 * website's Ask Mark never hears about the app, the drills or the 45 days.
 * test/context.test.js holds that line.
 */

const TIERS = {
  five_minute: 'five-minute drill',
  uncomfortable: 'uncomfortable drill',
  daily: 'daily drill',
};
const STATUSES = { pending: 'not answered yet', done: 'did it', dodged: 'dodged it' };
const REASONS = {
  fear: 'fear',
  time: 'no time',
  forgot: 'forgot',
  point: "didn't see the point",
  other: 'something else',
};
const EFFORT = ['easy', 'doable', 'challenging', 'hard', 'brutal'];

/** One line of plain text: no newlines or control characters, trimmed, capped. */
function clean(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function int(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * Returns a cleaned context, or null if it is missing or not usable.
 * Unknown fields are dropped. Strings are single-line and length-capped.
 */
function sanitizeContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const phase = raw.phase === 'practice' ? 'practice' : raw.phase === 'spine' ? 'spine' : null;
  if (!phase) return null;

  const rule = int(raw.rule, 1, 15);
  const ruleTitle = clean(raw.ruleTitle, 80);
  const tier = Object.prototype.hasOwnProperty.call(TIERS, raw.tier) ? raw.tier : null;
  const drill = clean(raw.drill, 300);
  const status = Object.prototype.hasOwnProperty.call(STATUSES, raw.status) ? raw.status : null;
  const dodgeReason = status === 'dodged' && Object.prototype.hasOwnProperty.call(REASONS, raw.dodgeReason) ? raw.dodgeReason : null;
  const effort = status === 'done' ? int(raw.effort, 1, 5) : null;

  if (phase === 'spine') {
    const day = int(raw.day, 1, 45);
    if (!day || !rule || !ruleTitle) return null;
    return { phase, day, rule, ruleTitle, tier, drill, status, dodgeReason, effort };
  }

  const dailySet = Array.isArray(raw.dailySet)
    ? raw.dailySet.map((t) => clean(t, 80)).filter(Boolean).slice(0, 15)
    : [];
  return { phase, rule, ruleTitle, tier, drill, status, dodgeReason, effort, dailySet };
}

/** The extra section for a cleaned context. */
function contextSection(ctx) {
  const lines = [
    '## THIS READER',
    '',
    "This reader is using the Brave & Boundless app, which turns the book's 15 rules into 45 daily drills (three per rule: a five-minute drill, an uncomfortable drill, a daily drill). Use what follows to make your answer specific to where they are. Don't recite it back, and only bring up the drills when they help with the question. Never shame a dodge.",
    '',
  ];
  if (ctx.phase === 'spine') {
    lines.push(`- Drill ${ctx.day} of 45: Rule ${ctx.rule}, "${ctx.ruleTitle}".`);
  } else {
    lines.push('- They finished all 45 drills and now practise chosen rules every day.');
    if (ctx.dailySet.length) lines.push(`- Their daily set: ${ctx.dailySet.map((t) => `"${t}"`).join(', ')}.`);
    if (ctx.rule && ctx.ruleTitle) lines.push(`- Today's rule: Rule ${ctx.rule}, "${ctx.ruleTitle}".`);
  }
  if (ctx.tier && ctx.drill) lines.push(`- Today's ${TIERS[ctx.tier]}: "${ctx.drill}"`);
  if (ctx.status) {
    let line = `- Today: ${STATUSES[ctx.status]}.`;
    if (ctx.dodgeReason) line += ` What got in the way: ${REASONS[ctx.dodgeReason]}.`;
    if (ctx.effort) line += ` It felt ${EFFORT[ctx.effort - 1]}.`;
    lines.push(line);
  }
  return lines.join('\n');
}

/** The system prompt for a request: the base prompt, plus the reader section when context is valid. */
function buildSystemPrompt(base, rawContext) {
  const ctx = sanitizeContext(rawContext);
  return ctx ? `${base}\n\n${contextSection(ctx)}` : base;
}

module.exports = { buildSystemPrompt, sanitizeContext };
