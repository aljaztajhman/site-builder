// M1 type and details (docs/plans/m1-type-details.md): the render-time switches are off until the owner turns them on.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.ts";

describe("details switches", () => {
  it("are all off, so live renders as before", () => {
    const { $comment: _, ...switches } = loadConfig().details;
    expect(switches).toEqual({ cta: false, header: false, aiCaption: false, fit: false, scale: false });
  });
});
