import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScenarioTree, ScenarioNode } from '@/types/scenarioTree';
import { ApiError } from '@/lib/apiError';
vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationModule);
import { resetNav, setUrl } from '@/test/navigation';
const getCases=vi.fn(),getScenarioTree=vi.fn();
vi.mock('@/lib/api',()=>({getCases:(...a:unknown[])=>getCases(...a),getScenarioTree:(...a:unknown[])=>getScenarioTree(...a)}));
import { ScenarioTreeView } from '@/components/lab/ScenarioTreeView';
const node=(id:string,parent_id:string|null,label:string,kind:ScenarioNode['kind']):ScenarioNode=>({id,parent_id,label,kind,description:'Koşullu inceleme',reasoning:'Kayıtlar doğrulanmalı.',source_ids:['case'],uncertainties:['Belge aslı eksik.'],probability:null,assessment_label:'Hesaplanmadı'});
const tree=(id='c1',version='a'.repeat(64)):ScenarioTree=>({case_id:id,title:id==='c1'?'Örnek A':'Örnek B',case_closed:false,context_version:version,generated_at:'2026-11-22T00:00:00Z',source_mode:'conditional_preparation',analysis_id:null,analysis_created_at:null,is_example:false,nodes:[node('root',null,'Dosya bağlamı','context'),node('confirm','root','Belgeler doğrulanırsa','development'),node('outcome','confirm','Hazırlık gözden geçirilir','outcome')],sources:[{id:'case',kind:'case',label:'Dosya kaydı',detail:'Sentetik bağlam',recorded_at:null}],current_facts:['Teslim tarihi kaydı'],uncertainties:['Belge aslı eksik.'],truncated:false,limits_note:'Gösterim sınırı',disclaimer:'Hukuki sonuç garantisi değildir.'});
beforeEach(()=>{vi.clearAllMocks();resetNav();setUrl('/ai/olasilik');getCases.mockResolvedValue([{id:'c1',case_name:'Örnek A',case_number:'A',client_name:'Sentetik'},{id:'c2',case_name:'Örnek B',case_number:'B',client_name:'Sentetik'}]);getScenarioTree.mockImplementation((id:string)=>Promise.resolve(tree(id)));});
describe('Scenario tree data boundaries',()=>{
 it('uses the same source in graph/text and never displays a guessed percentage',async()=>{
  render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await screen.findByText('Koşullu hazırlık yolları');
  expect(screen.getByRole('group',{name:'Dosya senaryo ağacı'})).toBeVisible();await userEvent.click(screen.getByRole('button',{name:'Metin alternatifi'}));
  expect(screen.getByRole('region',{name:'Ağacın metin alternatifi'})).toHaveTextContent('Belgeler doğrulanırsa');expect(screen.getAllByText(/Hesaplanmadı/).length).toBeGreaterThan(0);expect(screen.queryByText(/%\d/)).not.toBeInTheDocument();
 });
 it('announces changed source content without browser persistence',async()=>{
  const storage=vi.spyOn(Storage.prototype,'setItem');render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await screen.findByText('Koşullu hazırlık yolları');getScenarioTree.mockResolvedValue(tree('c1','b'.repeat(64)));
  await userEvent.click(screen.getByRole('button',{name:'Kaynakları yenile'}));expect(await screen.findByRole('status')).toHaveTextContent('Kaynaklar önceki görüntülemeye göre değişti');expect(storage).not.toHaveBeenCalled();storage.mockRestore();
 });
 it('ignores stale responses after a different case is selected',async()=>{
  let resolveA:(value:ScenarioTree)=>void=()=>{};getScenarioTree.mockImplementation((id:string)=>id==='c1'?new Promise<ScenarioTree>(r=>{resolveA=r;}):Promise.resolve(tree(id)));
  render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await userEvent.click(screen.getByRole('button',{name:/Örnek B/}));await screen.findByText('Koşullu hazırlık yolları');await act(async()=>resolveA(tree('c1')));
  await waitFor(()=>expect(screen.getByText(/Seçili dosya: Örnek B/)).toBeInTheDocument());expect(screen.queryByText(/Seçili dosya: Örnek A/)).not.toBeInTheDocument();
 });
 it('renders a scoped Turkish error without an old tree',async()=>{
  getScenarioTree.mockRejectedValue(new ApiError('Case not found',404));render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));expect(await screen.findByRole('alert')).toHaveTextContent('Dosya bulunamadı veya bu dosyaya erişiminiz yok.');expect(screen.queryByRole('group',{name:'Dosya senaryo ağacı'})).not.toBeInTheDocument();
 });
});
