/**
 * Sub-trade motifs (variety engine Step 3, spec v15 business.subtype): the drawn objects of trades that share a
 * template's layout with another trade. On Cevi's layout (plumbing and heating draw a radiator): an electrician's
 * socket on its cable, a carpenter's dovetailed corner, a roofer's tiled roof, a painter's colour strip and roller. On
 * Etiketa's (a deli's olive branch): a florist's stem, a boutique's hang tag. All decorative (aria-hidden), coloured
 * from the site's tokens by CSS classes in styles/motifs.css, which apply only under the site's [data-submotif].
 */
import { cx } from "../primitives/index.tsx";

/** A wall socket fed by a cable routed down the wall, with clips, and a second cable leaving it (motif wire). */
export function WireDrawing({ className }: { className?: string | undefined }) {
  return (
    <svg className={cx("wire", className)} viewBox="0 0 540 520" fill="none" aria-hidden="true" focusable="false">
      <path className="wire__live" d="M70 0V262a28 28 0 0 0 28 28H250" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      <path className="wire__out" d="M350 390V444a28 28 0 0 0 28 28H540" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      {[70, 170].map((y) => (
        <rect key={y} className="wire__clip" x="52" y={y} width="36" height="16" rx="4" />
      ))}
      <rect className="wire__clip" x="452" y="454" width="16" height="36" rx="4" />
      <rect className="wire__plate" x="250" y="190" width="200" height="200" rx="28" strokeWidth="8" />
      <circle className="wire__face" cx="350" cy="290" r="66" strokeWidth="8" />
      <circle className="wire__pin" cx="322" cy="290" r="11" />
      <circle className="wire__pin" cx="378" cy="290" r="11" />
      <rect className="wire__pin" x="342" y="226" width="16" height="16" rx="3" />
      <rect className="wire__pin" x="342" y="338" width="16" height="16" rx="3" />
    </svg>
  );
}

/**
 * A dovetail joint drawn apart (motif joint): the upright board with its socket, and the cross board's tail just
 * pulled out of it, both with their grain.
 */
export function JointDrawing({ className }: { className?: string | undefined }) {
  return (
    <svg className={cx("joint", className)} viewBox="0 0 540 520" fill="none" aria-hidden="true" focusable="false">
      <path className="joint__upright" d="M64 24H236V318L156 286V454L236 422V496H64Z" strokeWidth="8" strokeLinejoin="round" />
      <path className="joint__grain" d="M98 52c10 70-8 140 2 210s-8 130 2 210M134 44c-6 60 8 120 0 190M196 44c6 60-6 110 2 170M128 330c6 50-4 100 2 140" strokeWidth="5" strokeLinecap="round" />
      <path className="joint__board" d="M512 270H274V318L194 286V454L274 422V470H512Z" strokeWidth="8" strokeLinejoin="round" />
      <path className="joint__grain" d="M300 304c60 10 120-8 190 2M218 370c90-8 180 10 272 0M300 440c60-8 130 8 190-2" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** A gable roof laid in courses of round-ended tiles, with a chimney (motif tiles). `id`: unique on the page (the clip path). */
export function TilesDrawing({ id, className }: { id: string; className?: string | undefined }) {
  const clip = `${id}-roof`;
  const rows: string[] = [];
  for (let r = 0; r < 9; r++) {
    const y = 78 + r * 26;
    for (let x = r % 2 ? -18 : 0; x < 540; x += 36) rows.push(`M${x} ${y}h36v16a18 12 0 0 1-36 0z`);
  }
  const even = rows.filter((_, i) => i % 2 === 0).join("");
  const odd = rows.filter((_, i) => i % 2 === 1).join("");
  return (
    <svg className={cx("tiles", className)} viewBox="0 0 540 520" fill="none" aria-hidden="true" focusable="false">
      <clipPath id={clip}>
        <path d="M270 64 506 312H34z" />
      </clipPath>
      <rect className="tiles__chimney" x="370" y="96" width="48" height="120" />
      <rect className="tiles__cap" x="360" y="84" width="68" height="20" rx="3" />
      <rect className="tiles__wall" x="78" y="300" width="384" height="196" strokeWidth="8" />
      <rect className="tiles__window" x="222" y="356" width="96" height="96" strokeWidth="8" />
      <g clipPath={`url(#${clip})`}>
        <path className="tiles__under" d="M270 64 506 312H34z" />
        <path className="tiles__a" d={even} strokeWidth="3" />
        <path className="tiles__b" d={odd} strokeWidth="3" />
      </g>
      <path className="tiles__verge" d="M22 322 270 58l248 264" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A painter's colour strip in the site's colours beside a roller that has just painted a stroke (motif strip). */
export function StripDrawing({ className }: { className?: string | undefined }) {
  return (
    <svg className={cx("strip", className)} viewBox="0 0 540 520" fill="none" aria-hidden="true" focusable="false">
      <path className="strip__paint" d="M300 20h190v118c-14 10-26-6-40 4s-28-6-44 4-30-8-46 2-30-6-40 4-20-4-20-4z" />
      <rect className="strip__roller" x="290" y="150" width="210" height="72" rx="14" strokeWidth="8" />
      <path className="strip__handle" d="M500 186h22v86H392v112" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="strip__grip" x="374" y="376" width="36" height="120" rx="12" />
      <g transform="rotate(-6 155 260)">
        <rect className="strip__card" x="70" y="32" width="170" height="456" rx="10" strokeWidth="6" />
        {["strip__c1", "strip__c2", "strip__c3", "strip__c4", "strip__c5"].map((c, i) => (
          // Primary, band, inverse, muted and a pale tint, as on a painter's fan deck.
          <rect key={c} className={c} x="88" y={52 + i * 82} width="134" height="68" rx="4" />
        ))}
      </g>
    </svg>
  );
}

/** A tulip on its stem with two leaves (motif stem), in the label's frame colour with the bloom in the primary colour. */
export function Stem() {
  return (
    <svg className="stem" viewBox="0 0 132 58" fill="none" aria-hidden="true" focusable="false">
      <path className="stem__stalk" d="M4 50C40 48 76 40 102 26" strokeWidth="3" strokeLinecap="round" />
      <ellipse className="stem__leaf" cx="42" cy="42" rx="17" ry="6" transform="rotate(-26 42 42)" />
      <ellipse className="stem__leaf" cx="70" cy="44" rx="15" ry="5.5" transform="rotate(16 70 44)" />
      <path className="stem__bloom" d="M100 28c-4-10-2-20 4-24 2 6 5 8 8 8s6-2 8-8c6 4 8 14 4 24-3 6-7 8-12 8s-9-2-12-8z" />
    </svg>
  );
}

/** A hang tag on its string (motif tag), the string in the label's frame colour, the tag in the primary colour. */
export function Tag() {
  return (
    <svg className="tag" viewBox="0 0 132 58" fill="none" aria-hidden="true" focusable="false">
      <path className="tag__string" d="M4 22c12-18 26 18 40 0s10-8 18 7" strokeWidth="2.5" strokeLinecap="round" />
      <path className="tag__body" d="M60 29 76 10h52v38H76z" />
      <circle className="tag__hole" cx="72" cy="29" r="4.5" />
      <path className="tag__stitch" d="M84 16h38v26H84" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}
