export class CalculatorLogic {
  expression = '0';
  resultPreview = '';
  justEvaluated = false;

  inputDigit(digit: string): string {
    if (this.justEvaluated) {
      this.expression = digit === '.' ? '0.' : digit;
      this.justEvaluated = false;
      this.resultPreview = '';
      return this.expression;
    }
    if (this.expression === '0' && digit !== '.') {
      this.expression = digit;
    } else {
      if (digit === '.') {
        const lastSegment = this.expression.split(/[+\-*/()]/).pop() ?? '';
        if (lastSegment.includes('.')) return this.expression;
      }
      this.expression += digit;
    }
    this.updatePreview();
    return this.expression;
  }

  inputOperator(op: '+' | '-' | '*' | '/'): string {
    this.justEvaluated = false;
    const trimmed = this.expression.trim();
    if (!trimmed || trimmed === 'Ошибка') {
      this.expression = op === '-' ? '-' : '0';
      return this.expression;
    }
    if (/[+\-*/]$/.test(trimmed)) {
      this.expression = trimmed.slice(0, -1) + op;
    } else {
      this.expression = trimmed + op;
    }
    this.updatePreview();
    return this.expression;
  }

  backspace(): string {
    if (this.justEvaluated || this.expression === 'Ошибка') {
      return this.clear();
    }
    this.expression =
      this.expression.length <= 1 ? '0' : this.expression.slice(0, -1);
    this.updatePreview();
    return this.expression;
  }

  clear(): string {
    this.expression = '0';
    this.resultPreview = '';
    this.justEvaluated = false;
    return this.expression;
  }

  evaluate(): string {
    const value = evaluateMathExpression(this.expression);
    if (value === null) {
      this.expression = 'Ошибка';
      this.resultPreview = '';
      this.justEvaluated = true;
      return this.expression;
    }
    const formatted = formatCalcNumber(value);
    this.resultPreview = `${this.expression} =`;
    this.expression = formatted;
    this.justEvaluated = true;
    return this.expression;
  }

  private updatePreview(): void {
    const value = evaluateMathExpression(this.expression);
    this.resultPreview = value !== null ? `= ${formatCalcNumber(value)}` : '';
  }
}

export function formatCalcNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Ошибка';
  const rounded = Math.round(value * 1e9) / 1e9;
  return String(rounded);
}

/**
 * Safe recursive-descent arithmetic parser (+, -, *, /, unary minus, parentheses).
 */
export function evaluateMathExpression(expr: string): number | null {
  const tokens = tokenizeMath(expr);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens!.length && (tokens![pos] === '+' || tokens![pos] === '-')) {
      const op = tokens![pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < tokens!.length && (tokens![pos] === '*' || tokens![pos] === '/')) {
      const op = tokens![pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/') {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number | null {
    if (pos >= tokens!.length) return null;
    const tok = tokens![pos];
    if (tok === '-') {
      pos++;
      const inner = parseFactor();
      return inner === null ? null : -inner;
    }
    if (tok === '(') {
      pos++;
      const inner = parseExpression();
      if (inner === null || tokens![pos] !== ')') return null;
      pos++;
      return inner;
    }
    const num = Number(tok);
    if (!Number.isFinite(num)) return null;
    pos++;
    return num;
  }

  const result = parseExpression();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}

function tokenizeMath(expr: string): string[] | null {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return null;
  const tokens: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let dots = 0;
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
        if (cleaned[i] === '.') dots++;
        if (dots > 1) return null;
        numStr += cleaned[i++];
      }
      if (numStr === '.') return null;
      tokens.push(numStr);
    } else if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}
