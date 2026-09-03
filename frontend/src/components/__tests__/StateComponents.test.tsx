import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

describe("shared state components", () => {
  it("LoadingState renders a loading message", () => {
    render(<LoadingState label="Yükleniyor..." />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("ErrorState renders the error message", () => {
    render(<ErrorState message="Veri alınamadı." />);
    expect(screen.getByText("Veri alınamadı.")).toBeInTheDocument();
  });

  it("EmptyState renders the empty message", () => {
    render(<EmptyState message="Henüz veri yok." />);
    expect(screen.getByText("Henüz veri yok.")).toBeInTheDocument();
  });
});
