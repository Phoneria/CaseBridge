import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordEditor, type RecordContext } from "@/components/management/RecordEditor";
import { RecordPanel } from "@/components/management/RecordPanel";
import { mgmt, type ManagementRecord } from "@/lib/management";
import { ApiError } from "@/lib/apiError";
import type { Case, ManagedUser } from "@/types";

const context:RecordContext={cases:[{id:"c1",case_number:"CB-1",case_name:"Sentetik dava",is_archived:false,client_name:"Sentetik Müvekkil"} as Case],users:[{id:"u1",full_name:"Örnek Avukat",email:"synthetic@example.com",status:"active",role:"lawyer"} as ManagedUser],documents:[],records:[],grants:[]};
beforeEach(()=>{vi.restoreAllMocks();});

describe("management workflow forms",()=>{
  it("saves a monetary entry with decimal precision and explicit case",async()=>{
    const save=vi.spyOn(mgmt,"save").mockResolvedValue({} as ManagementRecord);
    const refresh=vi.fn().mockResolvedValue(undefined);const close=vi.fn();
    render(<RecordEditor kind="finance" context={context} onClose={close} onSaved={refresh}/>);
    await userEvent.type(screen.getByLabelText("Başlık *"),"Sentetik ücret");
    await userEvent.selectOptions(screen.getByLabelText("Dava *"),"c1");
    await userEvent.type(screen.getByLabelText("Tutar *"),"1000.25");
    await userEvent.click(screen.getByRole("button",{name:"Kaydet"}));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({kind:"finance",case_id:"c1",data:expect.objectContaining({entry_type:"fee",amount:"1000.25",currency:"TRY"})}),undefined,undefined);
    expect(refresh).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
  });

  it("keeps a failed save open with the server message",async()=>{
    vi.spyOn(mgmt,"save").mockRejectedValue(new ApiError("Bu büroda kayıt bulunamadı.",404));
    const close=vi.fn();
    render(<RecordEditor kind="support" context={context} onClose={close} onSaved={vi.fn()}/>);
    await userEvent.type(screen.getByLabelText("Başlık *"),"Sentetik destek");
    await userEvent.click(screen.getByRole("button",{name:"Kaydet"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu büroda kayıt bulunamadı.");
    expect(close).not.toHaveBeenCalled();
  });

  it("clears deadline verification when the source changes",async()=>{
    const row={id:"r1",kind:"deadline",title:"Sentetik süre",status:"open",case_id:"c1",owner_id:"u1",due_date:"2026-12-01",version:1,data:{source:"Önceki dayanak",backup_id:"u2",verified:true,reminder_days:[1,0],note:""}} as unknown as ManagementRecord;
    render(<RecordEditor kind="deadline" row={row} context={context} onClose={vi.fn()} onSaved={vi.fn()}/>);
    expect(screen.getByRole("checkbox",{name:/Süre dayanağını/})).toBeChecked();
    await userEvent.type(screen.getByLabelText("Sürenin dayanağı *")," değişti");
    expect(screen.getByRole("checkbox",{name:/Süre dayanağını/})).not.toBeChecked();
  });

  it("creates a sequential checklist template and protects prerequisites",async()=>{
    render(<RecordEditor kind="checklist" context={context} onClose={vi.fn()} onSaved={vi.fn()}/>);
    await userEvent.selectOptions(screen.getByLabelText("Şablon"),"opening");
    expect(screen.getByRole("checkbox",{name:"2. adım tamamlandı"})).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox",{name:"1. adım tamamlandı"}));
    expect(screen.getByRole("checkbox",{name:"2. adım tamamlandı"})).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox",{name:"2. adım tamamlandı"}));
    await userEvent.click(screen.getByRole("checkbox",{name:"1. adım tamamlandı"}));
    expect(screen.getByRole("checkbox",{name:"2. adım tamamlandı"})).not.toBeChecked();
  });

  it("filters operational records by status and text",async()=>{
    const rows=[{id:"s1",kind:"support",title:"İlk kayıt",status:"open",data:{priority:"normal",note:""},updated_at:"2026-11-11T10:00:00"},{id:"s2",kind:"support",title:"İkinci kayıt",status:"resolved",data:{priority:"low",note:""},updated_at:"2026-11-11T10:00:00"}] as unknown as ManagementRecord[];
    render(<RecordPanel kind="support" context={{...context,records:rows}} refresh={vi.fn()}/>);
    await userEvent.selectOptions(screen.getByLabelText("Durum filtresi"),"resolved");
    expect(screen.getByRole("heading",{name:"İkinci kayıt"})).toBeInTheDocument();
    expect(screen.queryByRole("heading",{name:"İlk kayıt"})).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Kayıtlarda ara"),"eşleşmeyen");
    expect(screen.getByText("Bu filtrelere uygun kayıt yok.")).toBeInTheDocument();
  });
});
