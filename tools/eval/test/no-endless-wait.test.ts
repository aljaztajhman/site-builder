import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs hook without types
import { endlessWait } from "../../../.claude/hooks/no-endless-wait.mjs";

describe("the no-endless-wait hook (owner, 2026-10-18)", () => {
  it("refuses the loops that waited two hours for a log that never came", () => {
    expect(endlessWait('until grep -q "Duration" ../eval-tests.log 2>/dev/null; do sleep 15; done; tail -c 3000 ../eval-tests.log')).toMatch(/Blocked/);
    expect(endlessWait('until [ -s "C:/tmp/out.txt" ]; do sleep 10; done')).toMatch(/Blocked/);
    expect(endlessWait("while true; do sleep 5; done")).toMatch(/Blocked/);
    expect(endlessWait("while (-not (Test-Path x)) { Start-Sleep 5 }")).toMatch(/Blocked/);
  });

  it("lets bounded waits and ordinary commands through", () => {
    expect(endlessWait('timeout 1800 bash -c \'until grep -q "Duration" a.log; do sleep 15; done\'')).toBeNull();
    expect(endlessWait("for i in $(seq 1 120); do grep -q done a.log && break; sleep 15; done")).toBeNull();
    expect(endlessWait("i=0; until [ -s out ] || [ $i -ge 60 ]; do i=$((i+1)); sleep 5; done")).toBeNull();
    expect(endlessWait("for ($i=0; $i -lt 40; $i++) { Start-Sleep 5 }")).toBeNull();
    expect(endlessWait("pnpm test --reporter=dot")).toBeNull();
    expect(endlessWait("while read -r line; do echo $line; done < list.txt")).toBeNull();
    expect(endlessWait(undefined)).toBeNull();
  });
});
