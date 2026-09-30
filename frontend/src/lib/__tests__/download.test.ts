import { afterEach, describe, expect, it, vi } from "vitest";

import { saveBlob } from "@/lib/download";

afterEach(() => vi.useRealTimers());

describe("saveBlob", () => {
  it("clicks a download link and revokes the object URL asynchronously", () => {
    vi.useFakeTimers();
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    saveBlob(new Blob(["a"]), "x.csv");

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    click.mockRestore();
  });
});
