import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));

vi.mock("@/lib/source-sync.functions", () => ({ syncEditorCode: (...a: unknown[]) => sync(...a) }));
vi.mock("@/lib/app-update", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/app-update")>();
  return { ...mod, fetchRemoteVersion: vi.fn(async () => null), sendNudge: vi.fn(async () => {}) };
});

import { UpdateCheck } from "@/components/UpdateCheck";

type SyncOk = {
  available: true;
  status: "same";
  local: string;
  remote: string | null;
  action: "same" | "push";
  diff: { added: string[]; changed: string[]; removed: string[] };
  pushed: null;
};

const SAME_FILES: SyncOk = {
  available: true, status: "same", local: "1.4.1", remote: "1.4.1", action: "same",
  diff: { added: [], changed: [], removed: [] }, pushed: null,
};

const DIFFERENT_FILES: SyncOk = {
  available: true, status: "same", local: "1.4.1", remote: "1.4.1", action: "push",
  diff: { added: [], changed: ["src/components/UpdateCheck.tsx"], removed: [] }, pushed: null,
};

/** Runs the check and waits for its result box. */
async function runCheck() {
  fireEvent.click(screen.getByRole("button", { name: "فحص التحديث" }));
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
}

afterEach(cleanup);

describe("update check button and update window", () => {
  it("hides the update button and the red dot when the files are identical", async () => {
    sync.mockResolvedValue(SAME_FILES);
    render(<UpdateCheck />);
    await runCheck();
    expect(screen.getByText(/نسختك مطابقة لـ GitHub/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحديث" })).not.toBeInTheDocument();
    expect(document.querySelector(".check-dot")).toBeNull();
  });

  it("shows the update button and a red dot when files differ", async () => {
    sync.mockResolvedValue(DIFFERENT_FILES);
    render(<UpdateCheck />);
    await runCheck();
    expect(screen.getByRole("button", { name: "تحديث" })).toBeInTheDocument();
    expect(document.querySelector(".check-dot")).not.toBeNull();
  });
});
