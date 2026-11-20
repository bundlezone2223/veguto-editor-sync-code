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
  status: "same" | "site-older" | "github-older";
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

/** Waits for the automatic, read-only check that runs when the page opens. */
async function finishAutomaticCheck() {
  await waitFor(() => expect(screen.getByRole("button", { name: "عرض النتيجة" })).toBeInTheDocument());
  expect(sync).toHaveBeenCalledWith({ data: { push: false } });
}

/** Opens the message produced by the automatic check. */
function showResult() {
  fireEvent.click(screen.getByRole("button", { name: "عرض النتيجة" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("update check button and update window", () => {
  it("checks on page entry and hides the update button and red dot when files are identical", async () => {
    sync.mockResolvedValue(SAME_FILES);
    render(<UpdateCheck />);
    await finishAutomaticCheck();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector(".check-dot")).toBeNull();
    showResult();
    expect(screen.getByText(/نسختك مطابقة لـ GitHub/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحديث" })).not.toBeInTheDocument();
  });

  it("shows a red dot after automatic checking, then reveals the update button on demand", async () => {
    sync.mockResolvedValue(DIFFERENT_FILES);
    render(<UpdateCheck />);
    await finishAutomaticCheck();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector(".check-dot")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "تحديث" })).not.toBeInTheDocument();
    showResult();
    expect(screen.getByRole("button", { name: "تحديث" })).toBeInTheDocument();
  });

  it("shows GitHub's higher number and no red dot when only the version number differs", async () => {
    sync.mockResolvedValue({ ...SAME_FILES, status: "site-older", local: "1.4.3", remote: "1.4.4" });
    render(<UpdateCheck />);
    await finishAutomaticCheck();
    expect(document.querySelector(".check-dot")).toBeNull();
    expect(screen.getAllByText("1.4.4").length).toBeGreaterThan(0);
    showResult();
    expect(screen.getByText(/نسختك مطابقة لـ GitHub/)).toBeInTheDocument();
    expect(screen.queryByText(/يوجد إصدار أحدث على GitHub/)).not.toBeInTheDocument();
  });

  it("never pushes files during the automatic page-entry check", async () => {
    sync.mockResolvedValue({ ...DIFFERENT_FILES, status: "github-older", local: "1.4.2", remote: "1.4.1" });
    render(<UpdateCheck />);
    await finishAutomaticCheck();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith({ data: { push: false } });
  });
});
