import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScenarioTree, ScenarioNode } from '@/types/scenarioTree';
import { ApiError } from '@/lib/apiError';
vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationModule);
import { resetNav, setUrl } from '@/test/navigation';
const getCases=vi.fn(),getScenarioTree=vi.fn(),getScenarioDemo=vi.fn();
vi.mock('@/lib/api',()=>({getCases:(...a:unknown[])=>getCases(...a),getScenarioTree:(...a:unknown[])=>getScenarioTree(...a),getScenarioDemo:(...a:unknown[])=>getScenarioDemo(...a)}));
import { scenarioMap } from '@/components/lab/scenarioMap';
import { ScenarioTreeView } from '@/components/lab/ScenarioTreeView';
const node=(id:string,parent_id:string|null,label:string,kind:ScenarioNode['kind']):ScenarioNode=>({id,parent_id,label,kind,description:'Koşullu inceleme',reasoning:'Kayıtlar doğrulanmalı.',source_ids:['case'],uncertainties:['Belge aslı eksik.'],probability:null,support_weight:kind==='development'?50:null,assessment_label:kind==='development'?'Demo tahmini':'Hesaplanmadı'});
const tree=(id='c1',version='a'.repeat(64)):ScenarioTree=>({case_id:id,title:id==='c1'?'Örnek A':'Örnek B',case_closed:false,context_version:version,generated_at:'2026-11-22T00:00:00Z',source_mode:'conditional_preparation',analysis_id:null,analysis_created_at:null,is_example:false,nodes:[node('root',null,'Dosya bağlamı','context'),node('confirm','root','Belgeler doğrulanırsa','development'),node('outcome','confirm','Hazırlık gözden geçirilir','outcome')],sources:[{id:'case',kind:'case',label:'Dosya kaydı',detail:'Sentetik bağlam',recorded_at:null}],current_facts:['Teslim tarihi kaydı'],uncertainties:['Belge aslı eksik.'],truncated:false,limits_note:'Gösterim sınırı',disclaimer:'Hukuki sonuç garantisi değildir.'});
beforeEach(()=>{vi.clearAllMocks();resetNav();setUrl('/ai/olasilik');getCases.mockResolvedValue([{id:'c1',case_name:'Örnek A',case_number:'A',client_name:'Sentetik'},{id:'c2',case_name:'Örnek B',case_number:'B',client_name:'Sentetik'}]);getScenarioTree.mockImplementation((id:string)=>Promise.resolve(tree(id)));});
describe('Scenario tree data boundaries',()=>{
 it('uses the same source in graph/text and displays independent demo weights consistently',async()=>{
  render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await screen.findByText('Koşullu hazırlık yolları');
  expect(screen.getByRole('group',{name:'Dosya senaryo ağacı'})).toBeVisible();await userEvent.click(screen.getByRole('button',{name:'Metin alternatifi'}));
  expect(screen.getByRole('region',{name:'Ağacın metin alternatifi'})).toHaveTextContent('Belgeler doğrulanırsa');expect(screen.getAllByText('Demo tahmini: 50/100').length).toBeGreaterThan(0);expect(screen.queryByText(/Hesaplanmadı/)).not.toBeInTheDocument();expect(screen.getByRole('region',{name:'Ağacın metin alternatifi'})).toHaveTextContent('Geçiş %100 · Başlangıçtan %100');
 });
 it('announces changed source content without browser persistence',async()=>{
  const storage=vi.spyOn(Storage.prototype,'setItem');render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await screen.findByText('Koşullu hazırlık yolları');getScenarioTree.mockResolvedValue(tree('c1','b'.repeat(64)));
  await userEvent.click(screen.getByRole('button',{name:'Kaynakları yenile'}));expect(await screen.findByRole('status')).toHaveTextContent('Kaynaklar veya varsayımlar önceki görüntülemeye göre değişti');expect(storage).not.toHaveBeenCalled();storage.mockRestore();
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

function demo(): ScenarioTree {
 const t=tree('demo:invoice-evidence-v1');t.source_mode='synthetic_demo';t.title='Sentetik fatura';t.nodes[1].support_weight=null;t.nodes[1].probability=.334;
 t.demo={method:'Eşit başlangıç, en büyük kalan.',missing_reason:'Gerekli kayıt eksik: eşit başlangıç.',assumptions:[{id:'document',label:'Belge',value:'missing',value_label:'Yok',explanation:'Eksik kayıt eşit başlangıç kullanır.'}],groups:[{question:'Aynı sorunun alternatifleri',definition:'Birbirini dışlayan üç alternatif.',total_points:3,weights:[{node_id:'confirm',score:1,percentage_tenths:334}]}]};return t;
}
it('discovers the detached demo and updates assumptions without persistence',async()=>{
 getScenarioDemo.mockResolvedValue(demo());render(<ScenarioTreeView/>);await userEvent.click(screen.getByRole('button',{name:'Kurgusal davayı aç — Demo tahmini'}));await screen.findByText('Kurgusal dosya — Demo tahmini');
 expect(screen.getAllByText(/Demo tahmini: %33,4/).length).toBeGreaterThan(0);
 await userEvent.selectOptions(screen.getByLabelText('Belge varsayımı'),'missing');await waitFor(()=>expect(getScenarioDemo).toHaveBeenLastCalledWith('missing','unknown'));
 expect(screen.queryByText('Dosya analizini aç')).not.toBeInTheDocument();expect(screen.queryByText(/Hesaplanmadı/)).not.toBeInTheDocument();
});
it('opens a demo deep link without bureau cases and ignores its late response after returning',async()=>{
 setUrl('/ai/olasilik?ornek=belge-dogrulama');getCases.mockResolvedValue([]);let resolve:(t:ScenarioTree)=>void=()=>{};getScenarioDemo.mockImplementation(()=>new Promise<ScenarioTree>(r=>{resolve=r;}));
 render(<ScenarioTreeView/>);await waitFor(()=>expect(getScenarioDemo).toHaveBeenCalled());await userEvent.click(screen.getByRole('button',{name:'Büro dosyalarına dön'}));await act(async()=>resolve(demo()));
 expect(screen.queryByText('Kurgusal dosya — Demo tahmini')).not.toBeInTheDocument();expect(screen.getByText('Bir dava seçin')).toBeInTheDocument();
});
it('sends branch assumptions for only the selected case',async()=>{
 const t=tree();t.support_model={method:'Bağımsız ölçek',assumptions:[{node_id:'confirm',value:'neutral',linked_records:0,delta:0,explanation:'50 nötr başlangıç'}]};getScenarioTree.mockResolvedValue(t);
 render(<ScenarioTreeView/>);await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));await screen.findByText('Koşullu hazırlık yolları');await userEvent.selectOptions(screen.getByLabelText('Varsayım: Belgeler doğrulanırsa'),'supports');await waitFor(()=>expect(getScenarioTree).toHaveBeenLastCalledWith('c1',{confirm:'supports'}));
});

it('opens the recorded dossier exhibit from its branch', async () => {
  const snapshot = tree();
  snapshot.source_mode = 'dossier_history';
  snapshot.sources.push({id:'document:pdf-1', kind:'document', label:'Banka dekontları', detail:'Delil eki', recorded_at:null});
  snapshot.nodes[1].source_ids = ['document:pdf-1'];
  snapshot.nodes[1].transition_percent = 60;
  snapshot.nodes[1].path_percent = 39;
  getScenarioTree.mockResolvedValue(snapshot);
  render(<ScenarioTreeView fixedCaseId="c1" />);
  await screen.findByText('Kurgusal dosyanın karar ağacı');
  const graph = screen.getByRole('group', {name:'Dosya senaryo ağacı'});
  await userEvent.click(within(graph).getByRole('button', {name:/Belgeler doğrulanırsa/}));
  expect(screen.getByRole('link', {name:'Banka dekontları'})).toHaveAttribute('href','/davalar/c1?sekme=belgeler&belge=pdf-1');
  expect(screen.getByText('Önceki adımdan geçiş %60')).toBeInTheDocument();
  expect(screen.getAllByText('Başlangıçtan ulaşma %39').length).toBeGreaterThan(0);
  expect(screen.queryByLabelText('Demo hesaplama yöntemi')).not.toBeInTheDocument();
});

it('zooms the graph within limits and retains the selected branch', async () => {
  render(<ScenarioTreeView fixedCaseId="c1" />);
  const graph = within(await screen.findByRole('group', {name:'Dosya senaryo ağacı'}));
  const branch = graph.getByRole('button', {name:/Belgeler doğrulanırsa/});
  await userEvent.click(branch);
  const smaller = graph.getByRole('button', {name:'Uzaklaştır'});
  const larger = graph.getByRole('button', {name:'Yakınlaştır'});
  for (let i = 0; i < 3; i++) await userEvent.click(smaller);
  expect(smaller).toBeDisabled();
  expect(branch.parentElement).toHaveStyle({transform:'scale(0.25)'});
  await userEvent.click(graph.getByRole('button', {name:'Ölçek %25, normal boyuta dön'}));
  expect(branch.parentElement).toHaveStyle({transform:'scale(1)'});
  for (let i = 0; i < 4; i++) await userEvent.click(larger);
  expect(larger).toBeDisabled();
  expect(branch.parentElement).toHaveStyle({transform:'scale(2)'});
  expect(branch).toHaveAttribute('aria-pressed','true');
  expect(getScenarioTree).toHaveBeenCalledTimes(1);
});

it('zooms at the pointer with the wheel and keeps selection', async () => {
  render(<ScenarioTreeView fixedCaseId="c1" />);
  const graph = within(await screen.findByRole('group', {name:'Dosya senaryo ağacı'}));
  const branch = graph.getByRole('button', {name:/Belgeler doğrulanırsa/});
  await userEvent.click(branch);
  fireEvent.wheel(branch, {deltaY:-100, clientX:80, clientY:40});
  await waitFor(() => expect(graph.getByRole('button', {name:'Ölçek %125, normal boyuta dön'})).toBeVisible());
  fireEvent.wheel(branch, {deltaY:100, clientX:80, clientY:40});
  await waitFor(() => expect(graph.getByRole('button', {name:'Ölçek %100, normal boyuta dön'})).toBeVisible());
  expect(branch).toHaveAttribute('aria-pressed','true');
});

it('separates recorded history from simulated percentages', async () => {
  const snapshot = tree();
  snapshot.case_closed = true;
  snapshot.nodes.push(node('second','root','İkinci seçenek','scenario'));
  snapshot.sources.push({id:'event:a', kind:'event', label:'Celse', detail:'Beyan alındı', recorded_at:'2024-03-01'});
  getScenarioTree.mockResolvedValue(snapshot);
  getCases.mockResolvedValue([{id:'c1', case_name:'Örnek A', case_number:'A', client_name:'Sentetik',
    outcome:'lost', closing_note:'Talep reddedildi.', decision_date:'2024-04-01'}]);
  render(<ScenarioTreeView />);
  await userEvent.click(await screen.findByRole('button',{name:/Örnek A/}));
  const graph = within(await screen.findByRole('group', {name:'Dosya senaryo ağacı'}));
  const outcome = graph.getByRole('button',{name:/Gerçekleşen yol.*Kaybedildi/});
  expect(graph.getByRole('button',{name:/Gerçekleşen yol.*Celse/})).toBeVisible();
  await userEvent.click(outcome);
  expect(screen.getByRole('region',{name:'Seçili dalın dayanakları'})).toHaveTextContent('Talep reddedildi.');
  const conditional = graph.getByRole('button',{name:/Belgeler doğrulanırsa/});
  const share = scenarioMap(snapshot).nodes.find(n => n.id === 'confirm')!.path_percent!;
  const label = share.toLocaleString('tr-TR');
  expect(conditional).toHaveTextContent('Temsili geçiş %' + label + ' · Başlangıçtan %' + label);
  expect(graph.getByRole('button',{name:/Hazırlık gözden geçirilir/})).toHaveTextContent('Temsili geçiş %100 · Başlangıçtan %' + label);
  await userEvent.click(conditional);
  expect(outcome).toHaveTextContent('Gerçekleşen yol');
});

it('centers the root between the outermost leaves', async () => {
  render(<ScenarioTreeView fixedCaseId="c1" />);
  const group = await screen.findByRole('group', {name:'Dosya senaryo ağacı'});
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button[title][aria-pressed]'));
  expect(buttons.length).toBeGreaterThanOrEqual(20);
  const root = buttons.find(button => button.title === 'Dosya bağlamı')!;
  const offsets = buttons.map(button => parseFloat(button.style.top));
  expect(parseFloat(root.style.top)).toBe((Math.min(...offsets) + Math.max(...offsets)) / 2);
});

it('expands short trees with stable varied illustrative shares and preserves supplied weights', () => {
  for (const mode of ['conditional_preparation', 'stored_analysis', 'synthetic_demo'] as const) {
    const input = tree();
    input.source_mode = mode;
    input.nodes.push(node('second','root','İkinci seçenek','scenario'), node('third','root','Üçüncü seçenek','scenario'));
    input.nodes[1].transition_percent = 13;
    const map = scenarioMap(input);
    expect(map.nodes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(map.nodes.map(n => n.id)).size).toBe(map.nodes.length);
    const percentages = (t: ScenarioTree) => t.nodes.filter(n => n.parent_id === 'root').map(n => n.transition_percent!);
    const shares = percentages(map);
    expect(shares[0]).toBe(13);
    expect(shares[1]).not.toBe(shares[2]);
    expect(shares.reduce((a,b) => a+b,0)).toBeCloseTo(100);
    expect(percentages(scenarioMap(input))).toEqual(shares);
    expect(percentages(scenarioMap({...input, case_id:'another-case'}))).not.toEqual(shares);
    for (const n of map.nodes.filter(n => n.id.startsWith('review:'))) {
      expect(n.recorded_step).toBeFalsy();
      expect(n.source_ids).toEqual(['case']);
      expect(map.nodes.some(parent => parent.id === n.parent_id)).toBe(true);
    }
    expect(input.nodes.length).toBe(5);
  }
});
