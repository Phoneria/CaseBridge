import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationModule);
import { resetNav, setUrl } from '@/test/navigation';
import { WorkspaceUserContext } from '@/components/AppShell';
import { GuideTour } from '@/components/GuideTour';
import { WorkspaceGuide } from '@/components/WorkspaceGuide';
import { contextTopic, guideTopics } from '@/lib/workspaceGuide';
import type { AppUser } from '@/types';
const admin: AppUser = { id:'a',email:'guide@example.test',full_name:'Örnek Yönetici',department:null,gender:null,role:'admin',law_firm_id:'synthetic',is_active:true };
beforeEach(() => { resetNav(); setUrl('/buro?tab=deadline'); });
describe('WorkspaceGuide', () => {
  it('shows purpose location and all instructions for the selected topic', async () => {
    setUrl('/rehber?konu=tasks');
    render(<WorkspaceUserContext.Provider value={admin}><WorkspaceGuide /></WorkspaceUserContext.Provider>);
    expect(screen.getByRole('article')).toHaveTextContent('hangi aşamada beklediğini');
    expect(screen.getByRole('article')).toHaveTextContent('Sol menü → Görevler');
    expect(screen.getByRole('heading',{name:'Kartı taşıyın'})).toBeVisible();
    expect(screen.getByRole('link',{name:'Ekranda adım adım göster'})).toHaveAttribute('href','/gorevler?tur=tasks');
    await userEvent.type(screen.getByRole('searchbox'), 'kritik süre');
    expect(screen.getByRole('link',{name:/Kritik süre ·/})).toHaveAttribute('href','/rehber?konu=bureau-deadline');
    expect(screen.queryByRole('link',{name:'Görevler · Proje panosu'})).toBeNull();
  });
  it('highlights real controls without activating them and cleans up on exit', async () => {
    setUrl('/raporlar?tur=reports');
    const action = vi.fn();
    const page = (show: boolean) => <><main id="main-content">
      <button onClick={action} data-guide="preview-cases">Önizle</button>
      <button onClick={action} data-guide="download-cases">CSV</button>
    </main>{show && <GuideTour user={admin} />}</>;
    const view = render(page(true));
    const preview = screen.getByRole('button',{name:'Önizle'});
    expect(preview).toHaveAttribute('data-guide-current');
    await userEvent.click(screen.getByRole('button',{name:'Sonraki'}));
    expect(preview).not.toHaveAttribute('data-guide-current');
    expect(screen.getByRole('button',{name:'CSV'})).toHaveAttribute('data-guide-current');
    expect(screen.getByRole('link',{name:'Turu bitir'})).toHaveAttribute('href','/rehber?konu=reports');
    await userEvent.click(screen.getByRole('button',{name:'Önceki'}));
    expect(preview).toHaveAttribute('data-guide-current');
    view.rerender(page(false));
    expect(preview).not.toHaveAttribute('data-guide-current');
    expect(action).not.toHaveBeenCalled();
  });
  it('finds controls added after page loading and tolerates missing targets', async () => {
    setUrl('/gorevler?tur=tasks');
    const page = (loaded: boolean) => <><main id="main-content">{loaded && <button data-guide="new-task">Yeni görev</button>}</main><GuideTour user={admin} /></>;
    const view = render(page(false));
    expect(screen.getByText(/Bu kontrol şu anda görünmüyor/)).toBeVisible();
    view.rerender(page(true));
    await waitFor(() => expect(screen.getByRole('button',{name:'Yeni görev'})).toHaveAttribute('data-guide-current'));
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
    for(const route of ['/dashboard','/davalar','/emsaller','/takvim','/gorevler','/belgeler','/analitik','/raporlar','/admin','/ai/sufle','/ai/durusma','/ai/sohbet','/ai/karsi-taraf','/ai/harita','/ai/olasilik','/ayarlar','/hesabim']) expect(contextTopic(topics,route,null).route).toBe(route);
    expect(contextTopic(topics,'/davalar/case-id',null).id).toBe('cases');
    const instructions = (id: string) => topics.find(topic => topic.id === id)?.steps.map(step => step.body).join(' ');
    expect(instructions('cases')).toContain('İlgili emsal kararları göster');
    expect(instructions('cases')).toContain('Olasılık Ağacı');
    expect(instructions('ai-directed')).toContain('CaseBridge AI');
    expect(instructions('tasks')).toContain('İncelemede');
    expect(instructions('reports')).toContain('Önizle');
    expect(new Set(topics.map(t=>t.id)).size).toBe(topics.length);
    for(const t of topics) {expect(t.steps.length).toBeGreaterThanOrEqual(2); for(const s of t.steps) {expect(s.title).toBeTruthy();expect(s.body).toBeTruthy();expect(s.check).toBeTruthy();}}
    expect(topics.find(t=>t.id==='bureau-team')?.steps[3].body).toContain('teslimi teyit');
    expect(topics.find(t=>t.id==='bureau-deadline')?.steps[2].body).toContain('bildirim servisinin');
    expect(topics.find(t=>t.id==='bureau-approval')?.steps[3].body).toContain('değiştirilemez');
    expect(topics.find(t=>t.id==='bureau-publication')?.steps[3].body).toContain('Kaydet ve yayımla');
  });
  it('rejects foreign guide topics and tours for restricted users', () => {
    const client = {...admin,workspace_position:'client'};
    setUrl('/rehber?konu=admin');
    const view = render(<WorkspaceUserContext.Provider value={client}><WorkspaceGuide /></WorkspaceUserContext.Provider>);
    expect(screen.getByRole('article')).toHaveTextContent('Çalışma Alanım · Müvekkil');
    expect(within(screen.getByRole('combobox')).getAllByRole('option').filter(option => option.getAttribute('value'))).toHaveLength(2);
    setUrl('/admin?tur=admin');
    view.rerender(<GuideTour user={client} />);
    expect(screen.queryByRole('region',{name:'Ekran turu'})).toBeNull();
  });
});
