import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DecisionText } from "@/components/DecisionText";

describe("DecisionText", () => {
  it("formats decision sections, court metadata and numbered reasoning", () => {
    render(<DecisionText text={"MAHKEMESİ : İstanbul Bölge Adliye Mahkemesi\nSAYISI : 2021/1924 E.\nI. DAVA\n1. Davacı vekili talepte bulundu.\nII. CEVAP\nDavalı vekili reddini istedi.\nSONUÇ\n- Karar bozuldu."} />);

    expect(screen.getByRole("heading", { name: "I. DAVA" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "II. CEVAP" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SONUÇ" })).toBeInTheDocument();
    expect(screen.getByText("MAHKEMESİ")).toBeInTheDocument();
    expect(screen.getByText("İstanbul Bölge Adliye Mahkemesi")).toBeInTheDocument();
    expect(screen.getByText("Davacı vekili talepte bulundu.")).toBeInTheDocument();
    expect(screen.getByText("Karar bozuldu.")).toBeInTheDocument();
  });

  it("shows a clear empty state when extracted text is missing", () => {
    render(<DecisionText text="  " />);
    expect(screen.getByText("Bu kaydın okunabilir metni bulunmuyor.")).toBeInTheDocument();
  });
});
