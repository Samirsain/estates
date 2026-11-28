import Decimal from "decimal.js-light";
import { validPlotTokens } from "./payment-percent.ts";

const NumberCell = Decimal.clone({ precision: 64 });

/** A single numeric worksheet cell. Names resolve only to the supplied cells. */
export function worksheetPoints(input: string, cells: Record<string, string>, base: string): string | null {
  const source = input.trim();
  if (!source || source.length > 160) return null;
  // A leading operator applies to this field's amount. Explicit formulas
  // keep their original meaning, including a unary sign after "=".
  let expression = source.replace(/^=/, "");
  if (/^\d+(?:\.\d+)?$/.test(source)) expression = `${base}/${source}`;
  else if (/^[*/+^-]/.test(source)) expression = base + source;
  else if (/^(?:\d+(?:\.\d+)?|\.\d+)\s*%$/.test(source)) expression = `${base}*${source}`;
  const parts = expression.toUpperCase().match(/\d*\.\d+|\d+|[A-Z]+[0-9]*|[^\s]/g) ?? [];
  let pos = 0;
  function take(token: string) {
    if (parts[pos] !== token) return false;
    pos++;
    return true;
  }
  function invalid(): never { throw new Error("Invalid formula"); }

  function atom(): Decimal {
    if (take("(")) {
      const result = sum();
      if (!take(")")) invalid();
      return result;
    }
    const token = parts[pos++];
    if (!token) return invalid();
    if (/^(?:\d+|\d*\.\d+)$/.test(token)) return new NumberCell(token);
    if (Object.hasOwn(cells, token)) return new NumberCell(cells[token]);
    if (!take("(")) return invalid();
    const args = [sum()];
    while (take(",")) args.push(sum());
    if (!take(")")) return invalid();
    switch (token) {
      case "SUM": return args.reduce((a, b) => a.plus(b));
      case "AVERAGE": return args.reduce((a, b) => a.plus(b)).div(args.length);
      case "MIN": return args.reduce((a, b) => a.lt(b) ? a : b);
      case "MAX": return args.reduce((a, b) => a.gt(b) ? a : b);
      case "ABS": return args.length === 1 ? args[0].abs() : invalid();
      case "ROUND": {
        if (args.length !== 2 || !args[1].isInteger() || args[1].abs().gt(16)) return invalid();
        const scale = new NumberCell(10).pow(args[1]);
        return args[0].times(scale).toDecimalPlaces(0, 4).div(scale);
      }
      default: return invalid();
    }
  }
  function signed(): Decimal {
    if (take("-")) return signed().negated();
    if (take("+")) return signed();
    let n = atom();
    while (take("%")) n = n.div(100);
    return n;
  }
  function power(): Decimal {
    let n = signed();
    while (take("^")) {
      const e = signed();
      if (!e.isInteger() || e.abs().gt(32)) return invalid();
      n = n.pow(e);
      if (Math.abs(n.exponent()) > 128) return invalid();
    }
    return n;
  }
  function product(): Decimal {
    let n = power();
    while (true) {
      if (take("*")) n = n.times(power());
      else if (take("/")) n = n.div(power());
      else return n;
    }
  }
  function sum(): Decimal {
    let n = product();
    while (true) {
      if (take("+")) n = n.plus(product());
      else if (take("-")) n = n.minus(product());
      else return n;
    }
  }
  try {
    const n = sum();
    if (pos !== parts.length || n.lte(0) || n.exponent() > 16) return null;
    const result = n.toDecimalPlaces(4, 4).toFixed();
    return validPlotTokens(result) ? result : null;
  } catch {
    return null;
  }
}
