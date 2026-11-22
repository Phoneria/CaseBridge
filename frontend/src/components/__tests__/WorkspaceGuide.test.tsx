import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationModule);
import { resetNav, setUrl } from '@/test/navigation';
import { WorkspaceGuide } from '@/components/WorkspaceGuide';
import { contextTopic, guideTopics } from '@/lib/workspaceGuide';
import type { AppUser } from '@/types';
const admin: AppUser = { id:'a',email:'guide@example.test',full_name:'Örnek Yönetici',department:null,gender:null,role:'admin',law_firm_id:'synthetic',is_active:true };
beforeEach(() => { resetNav(); setUrl('/buro?tab=deadline'); });
describe('WorkspaceGuide', () => {
  it('opens the current bureau topic and navigates without network or storage writes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup(); render(<WorkspaceGuide user={admin}/>);
    const trigger = screen.getByRole('button', {name:'Rehber'}); await user.click(trigger);
    expect(screen.getByRole('combobox', {name:'Konu seçin'})).toHaveValue('bureau-deadline');
    expect(screen.getByRole('heading', {name:'Dosya ve sorumluyu belirleyin'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Önceki'})).toBeDisabled();
    await user.click(screen.getByRole('button', {name:'Sonraki'}));
    expect(screen.getByRole('heading', {name:'Yedek ve doğrulamayı ekleyin'})).toHaveFocus();
    await user.click(screen.getByRole('button', {name:'Önceki'}));
    expect(screen.getByRole('status')).toHaveTextContent('Adım 1 / 4');
    await user.selectOptions(screen.getByRole('combobox'), 'bureau-publication');
    expect(screen.getByRole('status')).toHaveTextContent('Adım 1 / 4');
    for(let i=0;i<3;i++) await user.click(screen.getByRole('button', {name:'Sonraki'}));
    expect(screen.getByRole('heading', {name:'Açıkça yayımlayın'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:'Baştan başla'}));
    expect(screen.getByRole('status')).toHaveTextContent('Adım 1 / 4');
    await user.click(screen.getByRole('button', {name:'Çıkış'}));
    expect(trigger).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    fetchSpy.mockRestore(); storage.mockRestore();
  });
  it('traps keyboard focus and restores it on Escape and finish', async () => {
    const user=userEvent.setup(); render(<WorkspaceGuide user={admin}/>);
    const trigger=screen.getByRole('button',{name:'Rehber'}); await user.click(trigger);
    expect(screen.getByRole('button',{name:'Çıkış'})).toHaveFocus();
    await user.tab({shift:true}); expect(screen.getByRole('button',{name:'Sonraki'})).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button',{name:'Çıkış'})).toHaveFocus();
    await user.keyboard('{Escape}'); expect(trigger).toHaveFocus();
    await user.click(trigger); await user.selectOptions(screen.getByRole('combobox'),'account');
    await user.click(screen.getByRole('button',{name:'Sonraki'}));
    await user.click(screen.getByRole('button',{name:'Rehberi bitir'})); expect(trigger).toHaveFocus();
  });
  it('filters platform restricted and lawyer topics before context matching', () => {
    const platform=guideTopics({...admin,is_platform_admin:true});
    expect(platform.map(t=>t.route)).toEqual(['/platform','/ayarlar','/hesabim']);
    for(const position of ['client','accountant','trainee','secretary','consultant','lawyer']) {
      const restricted=guideTopics({...admin,workspace_position:position});
      expect(restricted.map(t=>t.route)).toEqual(['/calisma-alanim','/hesabim']);
      expect(contextTopic(restricted,'/buro','deadline').id).toBe('workspace');
    }
    const lawyer=guideTopics({...admin,role:'lawyer'});
    expect(lawyer.some(t=>t.route==='/buro'||t.route==='/admin'||t.route==='/platform')).toBe(false);
    expect(lawyer.find(t=>t.id==='settings')?.steps[1].body).toContain('büro yöneticisine');
    expect(guideTopics({...admin,workspace_position:'client'})[0].steps[0].body).toContain('açıkça yayımlanan');
    expect(guideTopics({...admin,workspace_position:'accountant'})[0].steps[0].body).toContain('mali ve zaman');
  });
  it('covers all bureau tabs and main routes with practical sourced steps', () => {
    const topics=guideTopics(admin);
    const tabs=['overview','team','deadline','finance','time','approval','client','communication','lead','checklist','leave','publication','access','ai','support','audit','trash'];
    for(const tab of tabs) expect(contextTopic(topics,'/buro',tab).id).toBe(`bureau-${tab}`);
    expect(contextTopic(topics,'/buro',null).id).toBe('bureau-overview');
    expect(contextTopic(topics,'/buro','unknown').id).toBe('bureau-overview');
    for(const route of ['/dashboard','/davalar','/emsaller','/takvim','/gorevler','/belgeler','/analitik','/raporlar','/admin','/ai','/ai/sufle','/ai/analiz','/ai/durusma','/ai/sohbet','/ai/karsi-taraf','/ai/yonetmen','/ai/harita','/ai/olasilik','/ayarlar','/hesabim']) expect(contextTopic(topics,route,null).route).toBe(route);
    expect(contextTopic(topics,'/davalar/case-id',null).id).toBe('cases');
    const instructions = (id: string) => topics.find(topic => topic.id === id)?.steps.map(step => step.body).join(' ');
    expect(instructions('cases')).toContain('İlgili emsal kararları göster');
    expect(instructions('cases')).toContain('Olasılık Ağacı');
    expect(instructions('tasks')).toContain('İncelemede');
    expect(instructions('reports')).toContain('Önizle');
    expect(new Set(topics.map(t=>t.id)).size).toBe(topics.length);
    for(const t of topics) {expect(t.steps.length).toBeGreaterThanOrEqual(2); for(const s of t.steps) {expect(s.title).toBeTruthy();expect(s.body).toBeTruthy();expect(s.check).toBeTruthy();}}
    expect(topics.find(t=>t.id==='bureau-team')?.steps[3].body).toContain('teslimi teyit');
    expect(topics.find(t=>t.id==='bureau-deadline')?.steps[2].body).toContain('bildirim servisinin');
    expect(topics.find(t=>t.id==='bureau-approval')?.steps[3].body).toContain('değiştirilemez');
    expect(topics.find(t=>t.id==='bureau-publication')?.steps[3].body).toContain('Kaydet ve yayımla');
  });
  it('closes on route or account scope change and hides the entry without a session', async () => {
    const user=userEvent.setup(); const view=render(<WorkspaceGuide user={admin}/>);
    await user.click(screen.getByRole('button',{name:'Rehber'}));
    setUrl('/buro?tab=team');view.rerender(<WorkspaceGuide user={admin}/>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Rehber'}));
    view.rerender(<WorkspaceGuide user={{...admin,workspace_position:'client'}}/>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Rehber'}));
    expect(within(screen.getByRole('combobox')).getAllByRole('option')).toHaveLength(2);
    view.rerender(<WorkspaceGuide user={null}/>);expect(screen.queryByRole('button',{name:'Rehber'})).not.toBeInTheDocument();
  });
});
