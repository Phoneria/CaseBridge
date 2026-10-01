import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AiBadge } from "@/components/ai/AiBadge";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiMark } from "@/components/ai/AiMark";
import { AiModelStatus } from "@/components/ai/AiModelStatus";

describe("AI design system", () => {
  it("renders the mark as decorative and the label as text", () => {
    const { container } = render(<AiMark withLabel />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("CaseBridge AI")).toBeInTheDocument();
  });

  it("keeps the default hero eyebrow brand in an English-language span", () => {
    const { container } = render(<AiHero title="Başlık" />);
    const brand = container.querySelector("p span[lang='en']");
    expect(brand).toHaveTextContent("CaseBridge AI");
  });

  it("renders the badge with an accessible AI label", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("renders card content and an optional disclaimer", () => {
    render(<AiCard disclaimer="AI tahminidir.">İçerik</AiCard>);
    expect(screen.getByText("İçerik")).toBeInTheDocument();
    expect(screen.getByText("AI tahminidir.")).toBeInTheDocument();
  });

  it("renders the hero title, eyebrow, stats and actions", () => {
    render(
      <AiHero
        title="CaseBridge AI"
        description="Açıklama"
        stats={[{ label: "Tamamlanan analiz", value: 4 }]}
        actions={<button type="button">Başlat</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeInTheDocument();
    expect(screen.getByText("Tamamlanan analiz")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Başlat" })).toBeInTheDocument();
  });

  it("shows model readiness or a settings warning", () => {
    const { rerender } = render(<AiModelStatus status={{ provider: "ollama", configured: true, error: null }} variant="dark" />);
    expect(screen.getByText("Model: ollama · Hazır")).toBeInTheDocument();

    rerender(<AiModelStatus status={{ provider: "ollama", configured: false, error: "x" }} variant="light" />);
    expect(screen.getByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ayarlar" })).toHaveAttribute("href", "/ayarlar");

    rerender(<AiModelStatus status={null} variant="light" />);
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });
});
