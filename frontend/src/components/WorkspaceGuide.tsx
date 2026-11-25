"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useState } from 'react';
import { WorkspaceUserContext } from '@/components/AppShell';
import { guideTopics, type GuideTopic } from '@/lib/workspaceGuide';
import { guideTours, topicDestination } from '@/lib/guideTours';

const sections = ['Çalışma alanı', 'Büro yönetimi', 'CaseBridge AI', 'Hesap ve ayarlar'];

function section(topic: GuideTopic) {
  if (topic.tab) return sections[1];
  if (topic.id.startsWith('ai-')) return sections[2];
  if (['account', 'settings'].includes(topic.id)) return sections[3];
  return sections[0];
}

function location(topic: GuideTopic) {
  if (topic.id === 'documents') return 'Davalar → İlgili dava → Belgeler';
  if (topic.id === 'precedents') return 'Davalar → İlgili dava → Genel Bakış → İlgili emsal kararları göster';
  if (['ai-analysis','ai-directed'].includes(topic.id)) return 'Davalar → İlgili dava → CaseBridge AI → ' + topic.title;
  if (['ai-counter','ai-courtroom'].includes(topic.id)) return 'CaseBridge AI → Canlı Duruşma ve Karşı Taraf Analizi → ' + topic.title;
  if (['ai-map','ai-scenarios'].includes(topic.id)) return 'CaseBridge AI → Olasılık Ağacı ve Bilgi Haritası → ' + topic.title;
  if (topic.id === 'account') return 'Sağ üstteki kullanıcı menüsü → Hesabım';
  const name = topic.title.split(' · ')[0];
  if (topic.tab) {
    const label = topic.tab === 'overview' ? 'Yönetim özeti' : topic.tab === 'deadline' ? 'Kritik süreler' : name;
    return 'Sol menü → Büro Yönetimi → ' + label;
  }
  if (topic.id.startsWith('ai-')) return 'Sol menü → CaseBridge AI → ' + name;
  return 'Sol menü → ' + (topic.id === 'platform' ? 'Büro Yönetimi' : name);
}

const guideHref = (id: string) => '/rehber?konu=' + encodeURIComponent(id);
const primary = 'inline-flex min-h-11 items-center rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700';

export function WorkspaceGuide() {
  const user = useContext(WorkspaceUserContext);
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState('');
  if (!user) return null;
  const topics = guideTopics(user);
  const current = topics.find(topic => topic.id === params.get('konu')) ?? topics[0];
  const term = search.trim().toLocaleLowerCase('tr');
  const groups = sections.map(label => ({
    label,
    topics: topics.filter(topic => section(topic) === label && (topic.title + ' ' + topic.purpose).toLocaleLowerCase('tr').includes(term)),
  })).filter(group => group.topics.length);
  const destination = topicDestination(current);
  return <div className="mx-auto max-w-6xl space-y-5">
    <header>
      <h1 className="text-3xl font-bold tracking-tight text-navy-900">Kullanım rehberi</h1>
      <p className="mt-2 text-sm text-navy-600">Yapmak istediğiniz işi seçip hangi ekranda, hangi adımları izleyeceğinizi öğrenin.</p>
    </header>
    <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label="Rehber konuları" className="min-w-0 rounded-2xl border border-surface-border bg-white p-4 lg:sticky lg:top-0">
        <label htmlFor="guide-search" className="text-sm font-semibold text-navy-900">Konu ara</label>
        <input id="guide-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Örn. görev, duruşma" className="mt-2 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy-900" />
        {!groups.length && <p role="status" className="mt-3 text-sm text-navy-600">Eşleşen konu bulunamadı.</p>}
        {groups.length > 0 && <>
          <label className="mt-3 block text-sm text-navy-700 lg:hidden">Konu seçin
            <select value={groups.some(group => group.topics.includes(current)) ? current.id : ''}
              onChange={event => router.push(guideHref(event.target.value), { scroll: false })}
              className="mt-1 min-h-11 w-full rounded-lg border border-surface-border bg-white px-2">
              <option value="" disabled>Konu seçin</option>
              {groups.map(group => <optgroup key={group.label} label={group.label}>
                {group.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
              </optgroup>)}
            </select>
          </label>
          <div className="mt-4 hidden max-h-[60dvh] space-y-4 overflow-y-auto lg:block">
            {groups.map(group => <section key={group.label}>
              <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-navy-500">{group.label}</h2>
              {group.topics.map(topic => <Link key={topic.id} href={guideHref(topic.id)}
                aria-current={current.id === topic.id ? 'page' : undefined}
                className={`block rounded-lg px-2.5 py-2 text-sm ${current.id === topic.id ? 'bg-accent-50 font-semibold text-accent-800' : 'text-navy-700 hover:bg-surface-muted'}`}>{topic.title}</Link>)}
            </section>)}
          </div>
        </>}
      </nav>
      <article aria-labelledby="guide-topic" className="min-w-0 rounded-2xl border border-surface-border bg-white p-5 sm:p-8">
        <h2 id="guide-topic" className="text-2xl font-bold tracking-tight text-navy-900">{current.title}</h2>
        <p className="mt-2 leading-7 text-navy-700">{current.purpose}</p>
        <div className="my-5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-accent-800">Nerede bulurum?</h3>
          <p className="mt-1 text-sm leading-6 text-navy-800">{location(current)}</p>
        </div>
        <h3 className="text-lg font-semibold text-navy-900">Nasıl kullanılır?</h3>
        <ol className="mt-2 divide-y divide-surface-border">
          {current.steps.map((step, index) => <li key={step.title} className="flex items-start gap-3 py-4">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-sm font-bold text-accent-800">{index + 1}</span>
            <div><h4 className="font-semibold text-navy-900">{step.title}</h4>
              <p className="mt-1 text-sm leading-6 text-navy-700">{step.body}</p>
              <p className="mt-2 border-l-2 border-accent-200 pl-3 text-sm leading-6 text-navy-600">{step.check}</p>
            </div>
          </li>)}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-surface-border pt-5">
          <Link href={destination} className={primary}>İlgili ekranı aç</Link>
          {guideTours[current.id] && <Link href={destination + '?tur=' + current.id} scroll={false} className="inline-flex min-h-11 items-center rounded-xl border border-accent-300 px-4 py-2 text-sm font-semibold text-accent-800">Ekranda adım adım göster</Link>}
        </div>
      </article>
    </div>
  </div>;
}
