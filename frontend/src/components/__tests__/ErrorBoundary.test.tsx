import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ErrorBoundary } from "@/components/ErrorBoundary";

function Bomb(): JSX.Element {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>çalışıyor</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("çalışıyor")).toBeInTheDocument();
  });

  it("catches a render error and shows a fallback instead of crashing", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText(/bir sorun oluştu/i)).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
