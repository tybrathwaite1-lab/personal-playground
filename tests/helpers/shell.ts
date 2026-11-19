/**
 * A deliberately small shell reader for workflow `run:` scripts (M2-2). It is not a shell
 * parser: it knows enough bash to find the commands a script runs and where variables are
 * expanded, for the scripts this repository writes. Anything it can't analyse (eval, source,
 * a command name built from a variable) is reported rather than guessed.
 *
 * - commands(): every simple command, including inside $(…), `…`, sh -c '…', and after
 *   wrappers such as env, exec, timeout, xargs; function definitions; reserved words and
 *   assignments removed; redirection targets skipped; case patterns skipped.
 * - expansions(): every $NAME / ${NAME…} outside single quotes, with whether it is inside double
 *   quotes, inside a command substitution, or in code passed to eval / sh -c.
 */

export interface Word {
  value: string; // the word with quotes removed (expansions left as written)
  raw: string; // the source text
  dynamic: boolean; // contains $…, `…` or ${…} outside single quotes
}
export interface Command {
  argv: Word[];
  via: string[]; // wrappers stripped to reach it (env, exec, sh -c, …)
}
export interface Parsed {
  commands: Command[];
  functions: string[];
  problems: string[];
}

type Tok = { t: 'word'; w: Word } | { t: 'op'; v: string };

const RESERVED = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}', 'time', 'in']);
const WRAPPERS = new Set(['env', 'exec', 'command', 'builtin', 'nohup', 'nice', 'timeout', 'xargs', 'sudo', 'stdbuf', 'setsid', 'time']);
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh']);

/** Reads a balanced region starting just after `open` at s[i]; returns the end index (exclusive). */
function balanced(s: string, i: number, open: string, close: string): number {
  let depth = 1;
  let q: string | null = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") q = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (q === '"') {
      if (c === '"') q = null;
      else if (c === '$' && s[i + 1] === '(') i = balanced(s, i + 2, '(', ')') - 1;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === '#' && open === '(' && /[\s;(]/.test(s[i - 1] ?? ' ')) while (i < s.length && s[i] !== '\n') i++;
    else if (s.startsWith(open, i) && open !== close) depth++;
    else if (s.startsWith(close, i) && --depth === 0) return i + close.length;
  }
  return s.length;
}

function tokenize(src: string, nested: (inner: string) => void): Tok[] {
  const s = src.replace(/\\\n/g, ' ');
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '#') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    const op = ['&&', '||', ';;', '>>', '<<<', '<<', '&>', '>&', '\n', ';', '|', '&', '(', ')', '<', '>'].find((o) => s.startsWith(o, i));
    if (op) {
      toks.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    // A word: runs until unquoted whitespace or operator.
    let value = '';
    let dynamic = false;
    const start = i;
    while (i < s.length && !/[\s;&|()<>]/.test(s[i])) {
      const ch = s[i];
      if (ch === '\\') {
        value += s[i + 1] ?? '';
        i += 2;
      } else if (ch === "'") {
        const end = s.indexOf("'", i + 1);
        value += s.slice(i + 1, end < 0 ? s.length : end);
        i = end < 0 ? s.length : end + 1;
      } else if (ch === '$' && s[i + 1] === "'") {
        const end = s.indexOf("'", i + 2);
        value += s.slice(i + 2, end < 0 ? s.length : end);
        i = end < 0 ? s.length : end + 1;
      } else if (ch === '"') {
        let j = i + 1;
        for (; j < s.length && s[j] !== '"'; j++) {
          if (s[j] === '\\') {
            value += s[j + 1];
            j++;
          } else if (s[j] === '$' && s[j + 1] === '(' && s[j + 2] !== '(') {
            const end = balanced(s, j + 2, '(', ')');
            nested(s.slice(j + 2, end - 1));
            value += s.slice(j, end);
            dynamic = true;
            j = end - 1;
          } else if (s[j] === '`') {
            const end = s.indexOf('`', j + 1);
            nested(s.slice(j + 1, end));
            dynamic = true;
            j = end;
          } else {
            if (s[j] === '$') dynamic = true;
            value += s[j];
          }
        }
        i = j + 1;
      } else if (ch === '$' && s.startsWith('$((', i)) {
        const end = balanced(s, i + 3, '((', '))');
        value += s.slice(i, end);
        dynamic = true;
        i = end;
      } else if (ch === '$' && s[i + 1] === '(') {
        const end = balanced(s, i + 2, '(', ')');
        nested(s.slice(i + 2, end - 1));
        value += s.slice(i, end);
        dynamic = true;
        i = end;
      } else if (ch === '$' && s[i + 1] === '{') {
        const end = balanced(s, i + 2, '{', '}');
        value += s.slice(i, end);
        dynamic = true;
        i = end;
      } else if (ch === '`') {
        const end = s.indexOf('`', i + 1);
        nested(s.slice(i + 1, end));
        value += s.slice(i, end + 1);
        dynamic = true;
        i = end + 1;
      } else {
        if (ch === '$') dynamic = true;
        value += ch;
        i++;
      }
    }
    toks.push({ t: 'word', w: { value, raw: s.slice(start, i), dynamic } });
  }
  return toks;
}

const isAssignment = (w: Word) => /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(w.raw);

/** All commands a script runs (see the module comment). */
export function commands(script: string, via: string[] = []): Parsed {
  const out: Parsed = { commands: [], functions: [], problems: [] };
  const merge = (p: Parsed) => {
    out.commands.push(...p.commands);
    out.functions.push(...p.functions);
    out.problems.push(...p.problems);
  };
  const toks = tokenize(script, (inner) => merge(commands(inner, [...via, '$(…)'])));

  let caseDepth = 0;
  let seg: Word[] = [];
  let skipNext = false; // the word after a redirection operator is its target
  const flush = (terminator: string) => {
    let words = seg;
    seg = [];
    if (!words.length) return;
    // case patterns: `pattern)` while inside case … esac
    if (caseDepth > 0 && terminator === ')') return;
    // Reserved words and leading assignments.
    while (words.length && (RESERVED.has(words[0].value) || isAssignment(words[0]))) words = words.slice(1);
    if (!words.length) return;
    const first = words[0].value;
    if (first === 'case') {
      caseDepth++;
      return;
    }
    if (first === 'esac') {
      caseDepth = Math.max(0, caseDepth - 1);
      return;
    }
    if (first === 'for' || first === 'select') return;
    out.commands.push(...strip(words, via, out));
  };
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === 'word') {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      seg.push(tk.w);
      continue;
    }
    if (['<', '>', '>>', '&>', '>&', '<<<'].includes(tk.v)) {
      // fd prefixes such as 2> belong to the redirection, not the command
      if (seg.length && /^\d+$/.test(seg[seg.length - 1].raw)) seg.pop();
      skipNext = true;
      continue;
    }
    if (tk.v === '<<') {
      out.problems.push('heredoc (not analysed)');
      skipNext = true;
      continue;
    }
    // name() { … } — a function definition
    if (tk.v === '(' && seg.length === 1 && /^[A-Za-z_][\w-]*$/.test(seg[0].raw) && toks[k + 1]?.t === 'op' && (toks[k + 1] as { v: string }).v === ')') {
      out.functions.push(seg[0].value);
      seg = [];
      k++;
      continue;
    }
    flush(tk.v);
  }
  flush('\n');
  return out;
}

/** Removes wrappers (env, exec, timeout, sh -c, …) to reach the command that actually runs. */
function strip(words: Word[], via: string[], out: Parsed): Command[] {
  const name = words[0].value;
  const base = name.split('/').pop() ?? name;
  if (SHELLS.has(base)) {
    const c = words.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w.value));
    if (c > 0 && words[c + 1]) {
      const inner = commands(words[c + 1].value, [...via, `${base} -c`]);
      out.functions.push(...inner.functions);
      out.problems.push(...inner.problems);
      return [{ argv: words, via }, ...inner.commands];
    }
  }
  if (WRAPPERS.has(base) && words.length > 1) {
    let rest = words.slice(1);
    // options, NAME=value pairs, and the duration/priority argument some wrappers take
    while (rest.length && (rest[0].value.startsWith('-') || isAssignment(rest[0]) || (/^(timeout|nice)$/.test(base) && /^\d/.test(rest[0].value)))) rest = rest.slice(1);
    if (rest.length) return [{ argv: words, via }, ...strip(rest, [...via, base], out)];
  }
  return [{ argv: words, via }];
}

export interface Expansion {
  name: string;
  quoted: boolean; // inside double quotes at its own nesting level
  inSubstitution: boolean; // inside $(…) or `…`
}

/** Every $NAME / ${NAME…} that the shell would expand (i.e. outside single quotes). */
export function expansions(script: string): Expansion[] {
  const out: Expansion[] = [];
  const scan = (s: string, inSub: boolean) => {
    let q: '"' | "'" | null = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q === "'") {
        if (c === "'") q = null;
        continue;
      }
      if (c === '\\') {
        i++;
        continue;
      }
      if (!q && c === '#' && /[\s;]/.test(s[i - 1] ?? '\n')) {
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }
      if (c === '"') {
        q = q ? null : '"';
        continue;
      }
      if (!q && c === "'") {
        q = "'";
        continue;
      }
      if (!q && c === '$' && s[i + 1] === "'") {
        const end = s.indexOf("'", i + 2);
        i = end < 0 ? s.length : end;
        continue;
      }
      if (c === '$' && s[i + 1] === '(' && s[i + 2] !== '(') {
        const end = balanced(s, i + 2, '(', ')');
        scan(s.slice(i + 2, end - 1), true);
        i = end - 1;
        continue;
      }
      if (c === '`') {
        const end = s.indexOf('`', i + 1);
        scan(s.slice(i + 1, end < 0 ? s.length : end), true);
        i = end < 0 ? s.length : end;
        continue;
      }
      if (c === '$') {
        const m = /^\$(?:\{[#!]?([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*))/.exec(s.slice(i));
        if (m) out.push({ name: m[1] ?? m[2], quoted: q === '"', inSubstitution: inSub });
      }
    }
  };
  scan(script, false);
  return out;
}
