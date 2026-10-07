import { describe, expect, it } from "vitest";
import { applyContentPatch, readPatchAnswer } from "../src/content-patch.ts";

describe("readPatchAnswer", () => {
  it("reads {patches: [...]} and a bare array, with prose around them", () => {
    const op = { op: "replace", path: "/pages/0/seo/title", value: "Pekarna" };
    expect(readPatchAnswer(JSON.stringify({ patches: [op] }))).toEqual({ ops: [op] });
    expect(readPatchAnswer(`Here is the fix:\n${JSON.stringify([op])}`)).toEqual({ ops: [op] });
  });

  it("passes a whole content answer on as one", () => {
    expect(readPatchAnswer(JSON.stringify({ chrome: {}, pages: [] }))).toEqual({ whole: { chrome: {}, pages: [] } });
  });

  it("says why it can't use an answer", () => {
    expect(readPatchAnswer("no")).toEqual({ error: "the patch answer is not valid JSON" });
    expect(readPatchAnswer(JSON.stringify({ patches: [] }))).toEqual({ error: "the patch is empty" });
    expect(readPatchAnswer(JSON.stringify({ patches: [{ op: "rename", path: "/a" }] }))).toHaveProperty("error");
  });
});

describe("applyContentPatch", () => {
  it("applies to a copy and leaves the base as it was", () => {
    const base = { pages: [{ seo: { title: "A" } }] };
    expect(applyContentPatch(base, [{ op: "replace", path: "/pages/0/seo/title", value: "B" }])).toEqual({ data: { pages: [{ seo: { title: "B" } }] } });
    expect(base.pages[0]!.seo.title).toBe("A");
  });

  it("refuses a path that isn't there and a failed test, with a one-line reason", () => {
    const base = { pages: [{ seo: { title: "A" } }] };
    const missing = applyContentPatch(base, [{ op: "replace", path: "/pages/3/seo/title", value: "B" }]);
    expect(missing).toHaveProperty("error");
    expect((missing as { error: string }).error).not.toContain("\n");
    expect(applyContentPatch(base, [{ op: "test", path: "/pages/0/seo/title", value: "Z" }])).toHaveProperty("error");
  });
});
