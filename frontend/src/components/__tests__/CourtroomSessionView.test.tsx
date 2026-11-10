import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCourtroomSession = vi.fn();
const sendCourtroomMove = vi.fn();
const retryCourtroomSession = vi.fn();
const abandonCourtroomSession = vi.fn();
const finishCourtroomSession = vi.fn();
const transcribeCourtroomAudio = vi.fn();
const getCourtroomTurnAudio = vi.fn();

vi.mock("@/lib/api", () => ({
  getCourtroomSession: (...args: unknown[]) => getCourtroomSession(...args),
  sendCourtroomMove: (...args: unknown[]) => sendCourtroomMove(...args),
  retryCourtroomSession: (...args: unknown[]) => retryCourtroomSession(...args),
  abandonCourtroomSession: (...args: unknown[]) => abandonCourtroomSession(...args),
  finishCourtroomSession: (...args: unknown[]) => finishCourtroomSession(...args),
  transcribeCourtroomAudio: (...args: unknown[]) => transcribeCourtroomAudio(...args),
  getCourtroomTurnAudio: (...args: unknown[]) => getCourtroomTurnAudio(...args),
}));

import { CourtroomSessionView, isFinishCommand } from "@/components/CourtroomSessionView";

const activeSession = {
  id: "session-1",
  scenario_id: "scenario-1",
  scenario_title: "Ödenmeyen Borç",
  chosen_role: "plaintiff",
  status: "active",
  phase: "opening",
  current_actor: "user",
  round_number: 1,
  max_rounds: 6,
  total_score: null,
  created_at: "2026-09-03T10:00:00Z",
  updated_at: "2026-09-03T10:00:00Z",
  scenario: {
    id: "scenario-1",
    slug: "borc",
    title: "Ödenmeyen Borç",
    summary: "Borç tartışması",
    category: "Borçlar Hukuku",
    plaintiff_name: "Zeynep Acar",
    defendant_name: "Burak Demir",
    difficulty: "beginner",
    estimated_rounds: 6,
    learning_objectives: ["Delil kullanmak"],
    public_facts: ["300.000 TL transfer edildi."],
    disputed_issues: ["Transfer borç muydu?"],
    legal_context: [],
  },
  role_brief: {
    objective: "Borcun geri ödeneceğini göstermek.",
    known_facts: ["Para geri ödenmedi."],
    strategy_notes: ["Dekontu zaman çizelgesiyle birleştir."],
  },
  available_evidence: [{
    id: "e1",
    code: "DEKONT",
    title: "Banka dekontu",
    description: "Transfer açıklaması",
    evidence_type: "banka",
    content: "3 ay vadeli borç",
    authenticity_status: "undisputed",
  }],
  turns: [{
    id: "t1",
    sequence_number: 1,
    actor: "system",
    legal_role: "system",
    turn_type: "instruction",
    content: "Simülasyon başladı.",
    evidence_code: null,
    evidence_title: null,
    structured_data: {},
    created_at: "2026-09-03T10:00:00Z",
  }],
  pending_judge_question: null,
  presented_evidence_codes: [],
  admitted_evidence_codes: [],
  rejected_evidence_codes: [],
  error_message: null,
  failure_category: null,
  model: "qwen3.5:9b",
  prompt_version: "courtroom-v1",
  evaluation: null,
};

beforeEach(() => {
  getCourtroomSession.mockReset().mockResolvedValue(activeSession);
  sendCourtroomMove.mockReset().mockResolvedValue({ ...activeSession, current_actor: "opponent" });
  retryCourtroomSession.mockReset();
  abandonCourtroomSession.mockReset();
  finishCourtroomSession.mockReset().mockResolvedValue({ ...activeSession, conversation_mode: true, phase: "closing", current_actor: "opponent" });
  transcribeCourtroomAudio.mockReset();
  getCourtroomTurnAudio.mockReset();
});

describe("CourtroomSessionView", () => {
  it("renders role-private material, public facts and the transcript", async () => {
    render(<CourtroomSessionView sessionId="session-1" />);

    expect(await screen.findByRole("heading", { name: "Ödenmeyen Borç" })).toBeInTheDocument();
    expect(screen.getByText("Borcun geri ödeneceğini göstermek.")).toBeInTheDocument();
    expect(screen.getByText("300.000 TL transfer edildi.")).toBeInTheDocument();
    expect(screen.getByText("Simülasyon başladı.")).toBeInTheDocument();
  });

  it("submits the phase-appropriate move and enters waiting state", async () => {
    render(<CourtroomSessionView sessionId="session-1" />);
    const textbox = await screen.findByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Transfer kaydı borç ilişkisini gösterir." } });
    fireEvent.click(screen.getByRole("button", { name: "Beyanı gönder" }));

    await waitFor(() => expect(sendCourtroomMove).toHaveBeenCalledTimes(1));
    expect(sendCourtroomMove.mock.calls[0][0]).toBe("session-1");
    expect(sendCourtroomMove.mock.calls[0][1]).toMatchObject({ action_type: "opening" });
    expect(await screen.findByText(/yanıt hazırlıyor/i)).toBeInTheDocument();
  });

  it("offers voice input and audio playback without changing the stored turn", async () => {
    getCourtroomSession.mockResolvedValue({ ...activeSession, turns: [
      ...activeSession.turns,
      { ...activeSession.turns[0], id: "t2", actor: "judge", content: "Delilinizi sunun." },
    ] });
    render(<CourtroomSessionView sessionId="session-1" />);
    expect(await screen.findByRole("button", { name: /Sesli beyan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dinle/ })).toBeInTheDocument();
    expect(screen.getByText(/yapay zekâ tarafından üretilir/)).toBeInTheDocument();
  });
});

const conversation = { ...activeSession, conversation_mode: true };

afterEach(() => { vi.unstubAllGlobals(); });

function mockMicrophone(text: string) {
  const stopTrack = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    onstop: (() => void) | null = null;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["synthetic recording"]) }); this.onstop?.(); }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  transcribeCourtroomAudio.mockResolvedValue({ text });
  return stopTrack;
}

describe("conversation mode", () => {
  beforeEach(() => {
    getCourtroomSession.mockResolvedValue(conversation);
    sendCourtroomMove.mockResolvedValue({ ...conversation, current_actor: "opponent" });
  });

  it("keeps the final draft when explicitly requesting the judge", async () => {
    render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Son talebimizin kabulünü istiyorum." } });
    fireEvent.click(screen.getByRole("button", { name: "Bitir ve karar iste" }));
    await waitFor(() => expect(finishCourtroomSession).toHaveBeenCalledWith("session-1", "Son talebimizin kabulünü istiyorum."));
    expect(sendCourtroomMove).not.toHaveBeenCalled();
    expect(await screen.findByText(/Hâkim karar ve değerlendirmeyi hazırlıyor/)).toBeInTheDocument();
  });

  it.each(["DONE!", "BİTİR."])("routes typed %s to the final evaluation", async (command) => {
    render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: command } });
    fireEvent.click(screen.getByRole("button", { name: "Beyanı gönder" }));
    await waitFor(() => expect(finishCourtroomSession).toHaveBeenCalledWith("session-1", undefined));
    expect(sendCourtroomMove).not.toHaveBeenCalled();
  });

  it("sends a recorded statement automatically and releases the microphone", async () => {
    const stopTrack = mockMicrophone("Savunmam bitti ama eklemek istediğim bir delil var.");
    render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Konuş/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Kaydı bitir" }));
    await waitFor(() => expect(sendCourtroomMove).toHaveBeenCalledTimes(1));
    expect(sendCourtroomMove.mock.calls[0][1]).toMatchObject({ content: "Savunmam bitti ama eklemek istediğim bir delil var.", action_type: "argument" });
    expect(finishCourtroomSession).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("keeps the recognized statement as a draft if automatic submission fails", async () => {
    mockMicrophone("Kaybolmaması gereken savunmam.");
    sendCourtroomMove.mockRejectedValue(new Error("Connection failed"));
    render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Konuş/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Kaydı bitir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hamle gönderilemedi.");
    expect(screen.getByRole("textbox")).toHaveValue("Kaybolmaması gereken savunmam.");
  });

  it("recognizes a spoken finish command separately from the closing draft", async () => {
    mockMicrophone("Bitir.");
    render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Son savunmam." } });
    fireEvent.click(screen.getByRole("button", { name: /Konuş/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Kaydı bitir" }));
    await waitFor(() => expect(finishCourtroomSession).toHaveBeenCalledWith("session-1", "Son savunmam."));
    expect(sendCourtroomMove).not.toHaveBeenCalled();
  });

  it("plays every segment of a long response and cancels on unmount", async () => {
    const play = vi.fn().mockImplementation(function (this: { onended?: () => void }) { queueMicrotask(() => this.onended?.()); return Promise.resolve(); });
    const pause = vi.fn();
    vi.stubGlobal("Audio", class { play = play; pause = pause; });
    URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = vi.fn();
    getCourtroomTurnAudio.mockResolvedValue(new Blob(["audio"]));
    getCourtroomSession.mockResolvedValue({ ...conversation, turns: [...conversation.turns, { ...conversation.turns[0], id: "long-reply", actor: "opponent", content: "😀".repeat(9000) }] });
    const view = render(<CourtroomSessionView sessionId="session-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Dinle/ }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(3));
    expect(getCourtroomTurnAudio.mock.calls).toEqual([["session-1", "long-reply"], ["session-1", "long-reply", 1], ["session-1", "long-reply", 2]]);
    await act(async () => view.unmount());
    expect(pause).toHaveBeenCalled();
  });

  it.each(["Savunmam bitti ama bir sorum var", "done kelimesi", "bitirme"])("keeps ordinary speech as a statement: %s", (text) => {
    expect(isFinishCommand(text)).toBe(false);
  });
});
