// Safe arithmetic evaluator: tokenizer + recursive descent parser.
// No eval / new Function. Supports + - * / % ^ ( ), unary minus,
// sqrt(). Returns null for malformed input.

interface Token {
  type: 'num' | 'op' | 'lparen' | 'rparen' | 'func';
  value: string;
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log
};

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, '');

  while (i < s.length) {
    const ch = s[i];

    if (/\d/.test(ch) || ch === '.') {
      let num = '';
      let dotCount = 0;
      while (i < s.length && (/[\d.]/.test(s[i]))) {
        if (s[i] === '.') {
          dotCount++;
          if (dotCount > 1) return null;
        }
        num += s[i];
        i++;
      }
      if (num === '.') return null;
      tokens.push({ type: 'num', value: num });
      continue;
    }

    if (/[+\-*/%^×÷]/.test(ch)) {
      const normalized = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
      tokens.push({ type: 'op', value: normalized });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }

    // Function names
    if (/[a-z]/i.test(ch)) {
      let name = '';
      while (i < s.length && /[a-z]/i.test(s[i])) {
        name += s[i];
        i++;
      }
      if (!(name.toLowerCase() in FUNCS)) return null;
      tokens.push({ type: 'func', value: name.toLowerCase() });
      continue;
    }

    return null; // unknown char
  }
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  // expression := term (('+'|'-') term)*
  private parseExpression(): number | null {
    let left = this.parseTerm();
    if (left === null) return null;
    while (this.peekOp('+') || this.peekOp('-')) {
      const op = this.tokens[this.pos].value;
      this.pos++;
      const right = this.parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  // term := factor (('*'|'/'|'%') factor)*
  private parseTerm(): number | null {
    let left = this.parsePower();
    if (left === null) return null;
    while (this.peekOp('*') || this.peekOp('/') || this.peekOp('%')) {
      const op = this.tokens[this.pos].value;
      this.pos++;
      const right = this.parsePower();
      if (right === null) return null;
      if ((op === '/' || op === '%') && right === 0) return null;
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  }

  // power := unary ('^' power)?   (right-associative)
  private parsePower(): number | null {
    const base = this.parseUnary();
    if (base === null) return null;
    if (this.peekOp('^')) {
      this.pos++;
      const exp = this.parsePower(); // recurse for right-assoc
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  }

  // unary := ('-')* primary
  private parseUnary(): number | null {
    if (this.peekOp('-')) {
      this.pos++;
      const v = this.parseUnary();
      return v === null ? null : -v;
    }
    if (this.peekOp('+')) {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  // primary := number | func '(' expr ')' | '(' expr ')'
  private parsePrimary(): number | null {
    const tok = this.tokens[this.pos];
    if (!tok) return null;

    if (tok.type === 'num') {
      this.pos++;
      const n = parseFloat(tok.value);
      return Number.isFinite(n) ? n : null;
    }

    if (tok.type === 'func') {
      this.pos++;
      if (!this.tokens[this.pos] || this.tokens[this.pos].type !== 'lparen') return null;
      this.pos++;
      const inner = this.parseExpression();
      if (inner === null) return null;
      if (!this.tokens[this.pos] || this.tokens[this.pos].type !== 'rparen') return null;
      this.pos++;
      const result = FUNCS[tok.value](inner);
      return Number.isFinite(result) ? result : null;
    }

    if (tok.type === 'lparen') {
      this.pos++;
      const inner = this.parseExpression();
      if (inner === null) return null;
      if (!this.tokens[this.pos] || this.tokens[this.pos].type !== 'rparen') return null;
      this.pos++;
      return inner;
    }

    return null;
  }

  private peekOp(op: string): boolean {
    const tok = this.tokens[this.pos];
    return !!tok && tok.type === 'op' && tok.value === op;
  }

  parse(): number | null {
    const result = this.parseExpression();
    if (result === null) return null;
    if (this.pos !== this.tokens.length) return null; // trailing garbage
    return result;
  }
}

/**
 * Evaluate an arithmetic expression safely.
 * Returns the numeric result, or null when the input is not a valid expression.
 */
export function evaluateExpression(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 200) return null;

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;

  // Require at least one digit — pure operators like "+" are search queries, not math
  if (!tokens.some((t) => t.type === 'num')) return null;

  return new Parser(tokens).parse();
}

/** Format a computed value compactly for display in the command bar. */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
  // Round to 10 significant digits to hide float noise like 0.30000000000000004
  const rounded = Number(n.toPrecision(10));
  if (Math.abs(rounded) >= 1e15 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
    return rounded.toExponential(6);
  }
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 });
}
