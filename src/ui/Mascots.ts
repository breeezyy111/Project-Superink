// Hand-drawn SVG mascots: Judge Jelly (results) and Tide Pop, the idol duo who host Splashburg News.

const INK = '#15121c';

/** Judge Jelly: a chubby jellyfish in a judge's wig. Holds a flag in each team's color. */
export function judgeJellySvg(colorA: string, colorB: string) {
  const curls = (x: number) =>
    [0, 1, 2, 3].map((i) => `<circle cx="${x}" cy="${78 + i * 17}" r="11.5" />`).join('');
  const tentacle = (x: number, i: number) => {
    const d = `M${x} 150 q${i % 2 ? 8 : -8} 16 0 30 q${i % 2 ? -8 : 8} 14 0 26`;
    return `<g class="jj-tent" style="animation-delay:${-i * 0.27}s;transform-origin:${x}px 150px">
      <path d="${d}" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="#ff9fd8" stroke-width="7" fill="none" stroke-linecap="round"/></g>`;
  };
  const flag = (side: 'a' | 'b', color: string) => {
    const x = side === 'a' ? 36 : 164;
    const dir = side === 'a' ? -1 : 1;
    return `<g class="jj-flag jj-flag-${side}" style="transform-origin:${x}px 160px">
      <path d="M${x} 160 L${x + dir * 6} 150" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
      <path d="M${x} 160 L${x + dir * 6} 150" stroke="#ff9fd8" stroke-width="5" stroke-linecap="round"/>
      <line x1="${x + dir * 6}" y1="152" x2="${x + dir * 6}" y2="92" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M${x + dir * 6} 94 l${dir * 40} 12 l${-dir * 40} 14 z" fill="${color}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    </g>`;
  };
  return `<svg class="judge-jelly" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
  ${flag('a', colorA)}${flag('b', colorB)}
  ${[62, 82, 100, 118, 138].map(tentacle).join('')}
  <g class="jj-body">
    <g fill="#f6f1e4" stroke="${INK}" stroke-width="4">${curls(46)}${curls(154)}</g>
    <path d="M38 150 C26 70 70 30 100 30 C130 30 174 70 162 150 C140 162 60 162 38 150 Z" fill="#ffb8e2" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M38 150 C60 140 140 140 162 150" fill="none" stroke="${INK}" stroke-width="4" opacity="0.25"/>
    <g fill="#f6f1e4" stroke="${INK}" stroke-width="4">
      <path d="M58 52 C70 26 130 26 142 52 C130 44 70 44 58 52 Z"/>
    </g>
    <ellipse cx="78" cy="58" rx="18" ry="9" fill="#fff" opacity="0.6" transform="rotate(-20 78 58)"/>
    <g class="jj-eyes">
      <ellipse cx="80" cy="100" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="120" cy="100" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
      <g class="jj-pupils"><circle cx="81" cy="103" r="6.5" fill="${INK}"/><circle cx="121" cy="103" r="6.5" fill="${INK}"/>
      <circle cx="83" cy="100" r="2" fill="#fff"/><circle cx="123" cy="100" r="2" fill="#fff"/></g>
    </g>
    <ellipse cx="64" cy="120" rx="8" ry="5" fill="#ff6fb5" opacity="0.6"/>
    <ellipse cx="136" cy="120" rx="8" ry="5" fill="#ff6fb5" opacity="0.6"/>
    <path class="jj-mouth" d="M92 124 q8 8 16 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M72 150 L100 166 L128 150" fill="${INK}"/>
    <path d="M92 152 l8 14 l8 -14 z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  </g>
</svg>`;
}

export interface IdolStyle {
  hair: string;
  hairDark: string;
  skin: string;
  outfit: string;
  accent: string;
  /** 'star' clip or 'beret' */
  extra: 'star' | 'beret';
  flip?: boolean;
}

/** An Inkfin idol: frilly cuttlefish fin hair, eye mask marking, stage outfit and a mic. */
export function idolSvg(s: IdolStyle) {
  // frilly fringe along the bottom of the hair
  const frill = (x0: number, x1: number, y: number, n: number) => {
    let d = `M${x0} ${y}`;
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) d += ` q${w / 2} ${i % 2 ? 12 : 9} ${w} 0`;
    return d;
  };
  const extra =
    s.extra === 'star'
      ? `<path d="M118 44 l5 10 11 1 -8 7 3 11 -11 -6 -10 6 3 -11 -8 -7 11 -1z" fill="#ffe14a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
      : `<path d="M44 40 C50 18 110 14 122 34 C126 42 116 46 104 44 C90 42 60 46 44 40 Z" fill="${s.accent}" stroke="${INK}" stroke-width="4"/><circle cx="84" cy="22" r="5" fill="${s.accent}" stroke="${INK}" stroke-width="3"/>`;
  return `<svg class="idol" viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="${s.flip ? 'transform:scaleX(-1)' : ''}">
  <g class="idol-bob">
    <!-- side fins (tentacle tails) -->
    <path class="idol-fin" d="M34 70 C10 90 8 130 22 160 C28 150 34 140 36 128 C40 112 44 96 46 80 Z" fill="${s.hair}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path class="idol-fin r" d="M126 70 C150 90 152 130 138 160 C132 150 126 140 124 128 C120 112 116 96 114 80 Z" fill="${s.hair}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <!-- body -->
    <path d="M56 150 C54 168 50 196 46 214 L114 214 C110 196 106 168 104 150 Z" fill="${s.outfit}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M58 172 L102 172" stroke="${s.accent}" stroke-width="6"/>
    <rect x="70" y="138" width="20" height="16" fill="${s.skin}" stroke="${INK}" stroke-width="4"/>
    <!-- arm with mic -->
    <path d="M100 160 C116 158 122 146 120 132" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M100 160 C116 158 122 146 120 132" stroke="${s.skin}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="114" y="112" width="10" height="24" rx="4" fill="#3b3550" stroke="${INK}" stroke-width="3"/>
    <circle cx="119" cy="108" r="9" fill="#d9d4e6" stroke="${INK}" stroke-width="3.5"/>
    <!-- head -->
    <ellipse cx="80" cy="100" rx="40" ry="42" fill="${s.skin}" stroke="${INK}" stroke-width="4"/>
    <!-- eye mask marking + eyes -->
    <path d="M44 96 C56 84 104 84 116 96 C110 112 96 112 80 106 C64 112 50 112 44 96 Z" fill="${INK}" opacity="0.9"/>
    <g class="idol-eyes">
      <ellipse cx="66" cy="98" rx="10" ry="12" fill="#fff"/><ellipse cx="94" cy="98" rx="10" ry="12" fill="#fff"/>
      <circle cx="67" cy="100" r="6" fill="${s.accent}"/><circle cx="95" cy="100" r="6" fill="${s.accent}"/>
      <circle cx="69" cy="97" r="2.4" fill="#fff"/><circle cx="97" cy="97" r="2.4" fill="#fff"/>
    </g>
    <path class="idol-mouth" d="M74 122 q6 6 12 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <!-- fin hair: rounded cuttlefish mantle with a frilly fringe -->
    <path d="M38 86 C30 40 60 22 80 22 C100 22 130 40 122 86 C116 76 108 70 96 70 C90 76 70 76 64 70 C52 70 44 76 38 86 Z" fill="${s.hair}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="${frill(40, 120, 78, 8)}" fill="none" stroke="${s.hairDark}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
    <ellipse cx="62" cy="40" rx="12" ry="6" fill="#fff" opacity="0.55" transform="rotate(-25 62 40)"/>
    ${extra}
  </g>
</svg>`;
}

export const LUMI: IdolStyle = { hair: '#ff6ad5', hairDark: '#c2349b', skin: '#ffd9b8', outfit: '#fff35c', accent: '#7a3cff', extra: 'star' };
export const SEPIA: IdolStyle = { hair: '#3fe0c5', hairDark: '#1a9c88', skin: '#c98d62', outfit: '#2b2440', accent: '#ff7a1a', extra: 'beret', flip: true };

/** Dr. Gloop: a grumpy sea slug scientist with goggles and a lab coat. */
export function drGloopSvg() {
  return `<svg class="dr-gloop" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
  <g class="dg-bob">
    <path d="M40 210 C30 150 40 90 70 70 C80 40 120 40 130 70 C160 90 170 150 160 210 Z" fill="#7dd85a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="70" cy="150" r="9" fill="#c25dff"/><circle cx="135" cy="120" r="7" fill="#c25dff"/><circle cx="120" cy="180" r="10" fill="#c25dff"/>
    <!-- lab coat -->
    <path d="M38 212 C42 170 58 150 76 146 L100 190 L124 146 C142 150 158 170 162 212 Z" fill="#fff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M100 190 L100 212" stroke="${INK}" stroke-width="4"/>
    <!-- eye stalks -->
    <path d="M82 60 C78 40 74 30 70 22" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M82 60 C78 40 74 30 70 22" stroke="#7dd85a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M118 60 C122 40 126 30 130 22" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M118 60 C122 40 126 30 130 22" stroke="#7dd85a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="68" cy="20" r="13" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="71" cy="22" r="6" fill="#ff2f6d"/>
    <circle cx="132" cy="20" r="13" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="129" cy="22" r="6" fill="#ff2f6d"/>
    <!-- goggles -->
    <rect x="62" y="84" width="76" height="12" rx="6" fill="${INK}"/>
    <circle cx="82" cy="90" r="15" fill="#ffb347" stroke="${INK}" stroke-width="5"/><circle cx="118" cy="90" r="15" fill="#ffb347" stroke="${INK}" stroke-width="5"/>
    <circle cx="77" cy="85" r="4" fill="#fff" opacity="0.8"/><circle cx="113" cy="85" r="4" fill="#fff" opacity="0.8"/>
    <!-- grumpy mouth -->
    <path d="M84 124 q16 -10 32 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>`;
}
