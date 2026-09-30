import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";
import { StatCard } from "@/components/StatCard";

describe("StatCard", () => {
  it("is a plain block without href", () => {
    render(<StatCard label="Ort. Dava Süresi (gün)" value={120} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is a link with href", () => {
    render(<StatCard label="Aktif Davalar" value={10} href="/davalar?durum=aktif&arsiv=dahil" />);
    expect(screen.getByRole("link", { name: /Aktif Davalar/ })).toHaveAttribute("href", "/davalar?durum=aktif&arsiv=dahil");
  });
});

describe("FilterChips", () => {
  it("renders nothing without chips", () => {
    const { container } = render(<FilterChips chips={[]} onRemove={vi.fn()} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("removes one chip or clears all, and shows the result count", async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterChips
        chips={[{ key: "kategori", label: "Kategori: İcra" }, { key: "arsiv", label: "Arşiv dahil" }]}
        onRemove={onRemove}
        onClear={onClear}
        resultCount={3}
      />,
    );

    expect(screen.getByText("3 sonuç")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kategori: İcra filtresini kaldır" }));
    expect(onRemove).toHaveBeenCalledWith("kategori");
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("offers a clear button in the filtered empty state", async () => {
    const onClear = vi.fn();
    render(<NoFilterResults onClear={onClear} />);
    expect(screen.getByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("ChartLegendLinks", () => {
  it("renders one keyboard-reachable link per item", () => {
    render(
      <ChartLegendLinks
        ariaLabel="Dava dağılımı kategorileri"
        items={[
          { key: "icra", label: "İcra", value: 3, href: "/davalar?kategori=icra&arsiv=dahil" },
          { key: "kira", label: "Kira", value: 5, href: "/davalar?kategori=kira&arsiv=dahil", color: "#6d43f5" },
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "Dava dağılımı kategorileri" });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İcra · 3" })).toHaveAttribute("href", "/davalar?kategori=icra&arsiv=dahil");
  });
});
