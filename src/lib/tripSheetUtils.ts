export type ColumnSourceType = 'manual' | 'db_link' | 'formula';

export interface ColumnMetaConfig {
  sourceType: ColumnSourceType;
  dbField?: string;
  formula?: string;
}

export const COL_META_ROW_KEY = '__col_meta__';

export interface DbLinkFieldOption {
  key: string;
  label: string;
  group: 'Invoice' | 'Driver' | 'Vehicle' | 'Fuel & Maintenance' | 'Expenses';
  dataType: 'text' | 'number' | 'currency';
}

export const DB_LINK_FIELD_OPTIONS: DbLinkFieldOption[] = [
  { key: 'invoice.billNumber', label: 'Invoice / Bill Number', group: 'Invoice', dataType: 'text' },
  { key: 'invoice.companyName', label: 'Consignee / Company Name', group: 'Invoice', dataType: 'text' },
  { key: 'invoice.paymentStatus', label: 'Payment Status (Paid / Unpaid)', group: 'Invoice', dataType: 'text' },
  { key: 'invoice.tdsPercentage', label: 'TDS Percentage (%)', group: 'Invoice', dataType: 'number' },
  { key: 'invoice.tdsAmount', label: 'TDS Deducted Amount (Rs)', group: 'Invoice', dataType: 'currency' },
  { key: 'invoice.keralaRtoPerTrip', label: 'Kerala RTO Share (Rs)', group: 'Invoice', dataType: 'currency' },
  { key: 'invoice.pnlRevenue', label: 'Net P&L Revenue (After TDS)', group: 'Invoice', dataType: 'currency' },
  { key: 'driver.phone', label: 'Driver Phone Number', group: 'Driver', dataType: 'text' },
  { key: 'driver.licenseNumber', label: 'Driver License Number', group: 'Driver', dataType: 'text' },
  { key: 'driver.ratePerKm', label: 'Driver Rate / KM (Rs)', group: 'Driver', dataType: 'currency' },
  { key: 'vehicle.type', label: 'Vehicle Type', group: 'Vehicle', dataType: 'text' },
  { key: 'vehicle.capacity', label: 'Vehicle Capacity', group: 'Vehicle', dataType: 'text' },
  { key: 'fuel.bunkName', label: 'Fuel Bunk / Station Name', group: 'Fuel & Maintenance', dataType: 'text' },
  { key: 'fuel.billNumber', label: 'Fuel Bill Number', group: 'Fuel & Maintenance', dataType: 'text' },
  { key: 'maintenance.workshopName', label: 'Maintenance Workshop Name', group: 'Fuel & Maintenance', dataType: 'text' },
  { key: 'maintenance.category', label: 'Maintenance Category', group: 'Fuel & Maintenance', dataType: 'text' },
  { key: 'expense.paidTo', label: 'Expense Paid To / Vendor', group: 'Expenses', dataType: 'text' },
  { key: 'expense.paymentMode', label: 'Expense Payment Mode', group: 'Expenses', dataType: 'text' },
];

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === '.') dotCount++;
        if (dotCount > 1) throw new Error(`Invalid number near "${numStr}."`);
        numStr += expr[i];
        i++;
      }
      const parsed = Number(numStr);
      if (isNaN(parsed)) throw new Error(`Invalid number "${numStr}"`);
      tokens.push({ type: 'number', value: parsed });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in formula`);
  }
  return tokens;
}

function parseTokens(tokens: Token[], resolveIdent: (key: string) => number): number {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume() as { type: 'op'; value: '+' | '-' };
      const right = parseTerm();
      left = op.value === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.type === 'op' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = consume() as { type: 'op'; value: '*' | '/' };
      const right = parseFactor();
      if (op.value === '/') {
        left = right === 0 ? 0 : left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of formula');

    if (tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const inner = parseFactor();
      return tok.value === '-' ? -inner : inner;
    }

    if (tok.type === 'number') {
      consume();
      return tok.value;
    }

    if (tok.type === 'ident') {
      consume();
      return resolveIdent(tok.value);
    }

    if (tok.type === 'paren' && tok.value === '(') {
      consume();
      const val = parseExpression();
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') {
        throw new Error('Missing closing parenthesis ")"');
      }
      consume();
      return val;
    }

    throw new Error('Invalid formula syntax');
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Unexpected trailing tokens in formula');
  }
  return isFinite(result) ? result : 0;
}

export function validateFormula(expr: string, validKeys: Set<string>): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return 'Please enter a formula expression.';
  try {
    const tokens = tokenizeFormula(trimmed);
    if (tokens.length === 0) return 'Please enter a formula expression.';
    parseTokens(tokens, (key) => {
      if (!validKeys.has(key)) {
        throw new Error(`Unknown column key "${key}"`);
      }
      return 1;
    });
    return null;
  } catch (err: any) {
    return err?.message || 'Invalid formula syntax.';
  }
}

export function evaluateFormula(
  expr: string,
  row: Record<string, any>,
  dataType: 'text' | 'number' | 'currency'
): number {
  const trimmed = expr.trim();
  if (!trimmed) return 0;
  try {
    const tokens = tokenizeFormula(trimmed);
    if (tokens.length === 0) return 0;
    const raw = parseTokens(tokens, (key) => {
      const val = Number(row[key]);
      return isFinite(val) ? val : 0;
    });
    if (dataType === 'currency') return Math.round(raw);
    return Math.round(raw * 100) / 100;
  } catch {
    return 0;
  }
}

export function parseColumnMeta(raw: string | undefined): ColumnMetaConfig {
  if (!raw) return { sourceType: 'manual' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.sourceType) {
      return {
        sourceType: parsed.sourceType,
        dbField: parsed.dbField,
        formula: parsed.formula,
      };
    }
  } catch {
    // Not JSON metadata
  }
  return { sourceType: 'manual' };
}

