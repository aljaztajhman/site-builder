import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { Motif } from "@sb/spec";
import { Branch, Limb, Radiator, Spoon } from "../../motifs/index.tsx";
import { ROLE_VAR, type ElOf } from "./layout.ts";

const fill = (role: keyof typeof ROLE_VAR): CSSProperties => ({ fill: ROLE_VAR[role], stroke: "none" });
const stroke = (role: keyof typeof ROLE_VAR, width: number): CSSProperties => ({ fill: "none", stroke: ROLE_VAR[role], strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round" });

/** Every drawing is decorative: hidden from assistive technology, never focusable. */
function Drawing({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${viewBox}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** The tread of a tyre (motif plate): chevrons on the band colour. */
function Tread() {
  return (
    <Drawing viewBox="160 28">
      <rect width="160" height="28" style={fill("band")} />
      {[0, 40, 80, 120].map((x) => (
        <path key={x} transform={`translate(${x} 0)`} d="M0 0h10l10 14 10-14h10v6L26 28H14L0 6z" style={fill("inverse")} />
      ))}
    </Drawing>
  );
}

/** The loaf's three scoring cuts (motif crust). */
function Cuts() {
  return (
    <Drawing viewBox="74 40">
      <path d="M6 6l14 28M30 6l14 28M54 6l14 28" style={stroke("accent", 7)} />
    </Drawing>
  );
}

/** A check mark and the book-keeper's double rule under it (motif ledger). */
function Check() {
  return (
    <Drawing viewBox="60 48">
      <path d="M6 20l16 16L54 4" style={stroke("primary", 8)} />
      <path d="M4 44h52M4 47h52" style={stroke("accent", 1.5)} />
    </Drawing>
  );
}

/** A mirror's arched frame with an inner arch (motif mirror). */
function Arch() {
  return (
    <Drawing viewBox="100 130">
      <path d="M8 124V50a42 42 0 0 1 84 0v74z" style={stroke("text", 4)} />
      <path d="M22 124V52a28 28 0 0 1 56 0v72z" style={stroke("accent", 2.5)} />
    </Drawing>
  );
}

/** A smile arc (motif smile). */
function Smile() {
  return (
    <Drawing viewBox="40 24">
      <path d="M4 5c5 18 27 18 32 0" style={stroke("accent", 6)} />
    </Drawing>
  );
}

/** A trail blaze: a ring round a centre (motif trail), in the site's accent. */
function Blaze() {
  return (
    <Drawing viewBox="26 26">
      <circle cx="13" cy="13" r="9" style={{ fill: ROLE_VAR.background, stroke: ROLE_VAR.accent, strokeWidth: 8 }} />
    </Drawing>
  );
}

/** The bend of a limb with its joint (motif bend). */
function Bend() {
  return (
    <Drawing viewBox="120 120">
      <path d="M20 4V60L100 112" style={stroke("primary", 18)} />
      <circle cx="20" cy="60" r="9" style={fill("accent")} />
    </Drawing>
  );
}

/** The library's drawing for a motif: the existing motif objects where there is one, small drawings in roles otherwise. */
const MOTIF_DRAWING: Record<Motif, () => ReactElement> = {
  plate: Tread,
  pipes: () => <Radiator />,
  crust: Cuts,
  ledger: Check,
  label: () => <Branch />,
  spoon: () => <Spoon />,
  mirror: Arch,
  smile: Smile,
  trail: Blaze,
  bend: () => <Limb />,
};

/** A drawing the designer wrote: sanitised paths (schema DecorPath), colours as roles only. */
function CustomDrawing({ svg }: { svg: NonNullable<ElOf<"decor">["svg"]> }) {
  return (
    <svg viewBox={`0 0 ${svg.width} ${svg.height}`} aria-hidden="true" focusable="false">
      {svg.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          style={{
            fill: p.fill === "none" ? "none" : ROLE_VAR[p.fill],
            stroke: !p.stroke || p.stroke === "none" ? "none" : ROLE_VAR[p.stroke],
            strokeWidth: p.width ?? 1,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }}
        />
      ))}
    </svg>
  );
}

export function DecorDrawing({ el }: { el: ElOf<"decor"> }) {
  if (el.svg) return <CustomDrawing svg={el.svg} />;
  if (el.motif) {
    const Motif = MOTIF_DRAWING[el.motif];
    return <Motif />;
  }
  return null;
}
