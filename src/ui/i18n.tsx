import { Fragment, type ReactNode } from 'react';
import { endsSentence, lang, template, type Params } from '../i18n';

// Rich text for the screens: a translated sentence with bold or coloured words and React values in it.
//
//   tx('Kasa <bad>{cash}</bad>. {weeks} hafta içinde artıya geçmezse şirket iflas eder.', { cash: money(c), weeks })
//
// Tags: <b> <i> <em> <strong> <small> <u> <br/>, and the game's tones <good> <bad> <warn> (bold, coloured)
// and <muted>. A sentence can bring its own tags (a link, a button) through `tags`.
// Parameters may be text, numbers or React elements.

type Wrap = (children: ReactNode, key: number) => ReactNode;

const TAGS: Record<string, Wrap> = {
  b: (c, k) => <b key={k}>{c}</b>,
  strong: (c, k) => <strong key={k}>{c}</strong>,
  i: (c, k) => <i key={k}>{c}</i>,
  em: (c, k) => <em key={k}>{c}</em>,
  u: (c, k) => <u key={k}>{c}</u>,
  small: (c, k) => <small key={k}>{c}</small>,
  good: (c, k) => (
    <b key={k} className="tone-good">
      {c}
    </b>
  ),
  bad: (c, k) => (
    <b key={k} className="tone-bad">
      {c}
    </b>
  ),
  warn: (c, k) => (
    <b key={k} className="tone-warn">
      {c}
    </b>
  ),
  muted: (c, k) => (
    <span key={k} className="muted">
      {c}
    </span>
  ),
};

const TOKEN = /(<\/?[a-zA-Z]+\s*\/?>|\{\w+\})/g;

/** A translated sentence as React: tags become elements, {placeholders} become the values given. */
export function tx(src: string, params: Record<string, ReactNode> = {}, tags: Record<string, Wrap> = {}): ReactNode {
  const counts: Params = {};
  if (typeof params.n === 'number') counts.n = params.n;
  const text = template(src, counts);
  const all = { ...TAGS, ...tags };
  const root: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[] }[] = [];
  let key = 0;
  const push = (node: ReactNode) => (stack.length ? stack[stack.length - 1].children : root).push(node);
  const parts = text.split(TOKEN);
  parts.forEach((part, i) => {
    if (!part) return;
    const open = /^<([a-zA-Z]+)\s*>$/.exec(part);
    const close = /^<\/([a-zA-Z]+)\s*>$/.exec(part);
    const single = /^<([a-zA-Z]+)\s*\/>$/.exec(part);
    const param = /^\{(\w+)\}$/.exec(part);
    if (single && single[1] === 'br') push(<br key={key++} />);
    else if (open && all[open[1]]) stack.push({ tag: open[1], children: [] });
    else if (close && stack.length && stack[stack.length - 1].tag === close[1]) {
      const done = stack.pop()!;
      push(all[done.tag](done.children, key++));
    } else if (param && param[1] in params) {
      let v = params[param[1]];
      // "$2,12 Mio." before the sentence's own period: one period.
      if (typeof v === 'string' && lang() !== 'tr' && endsSentence(v, parts.slice(i + 1).join(''))) v = v.slice(0, -1);
      push(typeof v === 'object' && v !== null ? <Fragment key={key++}>{v}</Fragment> : v);
    } else push(part);
  });
  // Unclosed tags: keep their text.
  while (stack.length) {
    const done = stack.pop()!;
    push(all[done.tag](done.children, key++));
  }
  return <>{root}</>;
}
