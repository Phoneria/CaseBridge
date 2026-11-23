import type { Case } from '@/types';
import type { ScenarioNode, ScenarioTree } from '@/types/scenarioTree';

type Route = readonly [condition: string, check: string, finding: string, reason: string, decision: string];

function routesFor(subject: string, criminal: boolean): Route[] {
  if (criminal) return [
    ['İsnat edilen fiil doğrulanırsa', 'Failin kimliği ve suçun unsurları ayrı ayrı incelenir', 'Fiilin bütün unsurları sanık yönünden sabit görülürse', 'Mahkeme karşı savunmayı da değerlendirip sorumluluğu sabit görür', 'İsnat edilen suçtan mahkûmiyet'],
    ['Fiili başka bir kişinin işlediği ileri sürülürse', 'Olay anı ile sanığın bağlantısı karşılaştırılır', 'Fiili sanığın işlemediği belirlenirse', 'Suç konusu olay sanığa yüklenemez', 'Fiili sanığın işlemediği gerekçesiyle beraat'],
    ['Deliller fail konusunda çelişirse', 'İsnadı doğrulayan ve çürüten kayıtlar karşılaştırılır', 'Çelişki giderilemezse', 'Sanığın fiili işlediği sabit görülemez', 'İsnat ispatlanamadığından beraat'],
  ];
  if (/tahliye/iu.test(subject)) {
    const damages = /tazminat/iu.test(subject);
    return [
      ['Tahliye sebebinin gerçekleştiği ileri sürülürse', 'Kira ilişkisi ile ileri sürülen tahliye sebebi birlikte incelenir', 'Tahliye koşulları' + (damages ? ' ve talep edilen zararın tamamı' : '') + ' kanıtlanırsa', 'İstem dosyadaki kira ilişkisi ve kanıtlanan olgularla desteklenir', damages ? 'Tahliyeye ve talep sınırında kanıtlanan zararın tazminine karar verilir' : 'Kiralananın tahliyesine karar verilir'],
      ['Kiracı tahliye sebebine karşı çıkarsa', 'Karşı kayıtlar ileri sürülen sebep ile karşılaştırılır', 'İleri sürülen tahliye sebebi gerçekleşmemişse', 'Dosyada gösterilen sebep tahliyeyi haklı kılmaz', damages ? 'Tahliye ve aynı sebebe dayanan tazminat istemi reddedilir' : 'Tahliye talebi reddedilir'],
      damages ? ['Tahliye ve tazminat ayrı ayrı incelenirse', 'Tahliye dayanağı ve zarar belgeleri karşılaştırılır', 'Tahliye koşulları sağlanır ancak zarar ispatlanamazsa', 'Kiralananın iadesi için koşullar oluşur, parasal istemin dayanağı eksik kalır', 'Tahliye kabul edilir, tazminat talebi reddedilir'] :
        ['Kiracı taşınmazı yargılama sırasında teslim ederse', 'Anahtar teslimi ve fiilî boşaltma birlikte incelenir', 'Kiralananın teslim edildiği doğrulanırsa', 'Tahliye isteminin konusu ortadan kalkar', 'Tahliye istemi hakkında karar verilmesine yer olmadığına karar verilir'],
    ];
  }
  if (/boşanma/iu.test(subject)) return [
    ['İleri sürülen boşanma sebebi doğrulanırsa', 'Taraf anlatımları dosyadaki delillerle birlikte incelenir', 'İleri sürülen sebebin koşulları kanıtlanırsa', 'Mahkeme evliliğin sona erdirilmesi istemini haklı görür', 'Boşanmaya karar verilir'],
    ['Karşı taraf belirleyici olayın gerçekleşmediğini ileri sürerse', 'Çekişmeli olayın zamanı ve tanıkların gözlemi karşılaştırılır', 'Dayanılan olayın gerçekleşmediği saptanırsa', 'Dosyada ileri sürülen boşanma sebebi oluşmaz', 'Boşanma talebi reddedilir'],
    ['Tarafların anlatımları çatışırsa', 'Beyanları doğrulayabilecek bağımsız kayıtlar incelenir', 'İleri sürülen sebep ispatlanamazsa', 'Dosyadaki belirsizlik talep lehine giderilemez', 'Boşanma talebi ispat yokluğundan reddedilir'],
  ];
  if (/menfi tespit|borçlu (olunmadığının|olmadığının)|borca itiraz/iu.test(subject)) return [
    ['Borçlu ödemeyi ileri sürerse', 'Ödeme açıklaması ve takipteki işlem karşılaştırılır', 'Aynı borcun tamamının ödendiği saptanırsa', 'Takibe konu bakiye borç bulunmadığı kabul edilir', 'Borçlunun istemi borcun tamamı yönünden kabul edilir'],
    ['Alacaklı bakiyenin sürdüğünü ileri sürerse', 'Ödeme itirazı ve alacağın doğumuna ilişkin kayıtlar incelenir', 'Borç devam ediyor ve ödeme başka bir işleme aitse', 'Borçlunun dayandığı ödeme bu borcu sona erdirmez', 'Borçlunun takibe konu borca ilişkin istemi reddedilir'],
    ['Ödeme yalnızca borcun bir bölümüne karşılık gelirse', 'Ödenmiş tutar ile takip bakiyesi ayrılır', 'Kısmi ödeme aynı borca bağlanırsa', 'Borçlunun itirazı ödenen bölümde haklı görülür', 'Borçlunun istemi ödenen kısım için kabul edilir, kalan kısım yönünden reddedilir'],
  ];
  if (/fatura|itirazın iptali|alacak/iu.test(subject)) {
    const enforcement = /itirazın iptali/iu.test(subject);
    const award = enforcement ? 'İtiraz iptal edilir, kanıtlanan alacak için takip devam eder' : 'Ödenmemiş alacağın tahsiline karar verilir';
    return [
      ['Alacağın doğduğu doğrulanırsa', 'Borç kaydı ve ileri sürülen ödemeler eşleştirilir', 'Aynı borcu kapatan ödeme veya başka sona erme sebebi kanıtlanamazsa', 'Belgelenen bakiye talep kapsamında ödenmemiş kalır', award],
      ['Borçlu tam ödeme ileri sürerse', 'Ödemenin tarafı, tarihi ve borç açıklaması karşılaştırılır', 'Aynı borcun tümüyle ödendiği belirlenirse', 'Talep edilebilir bakiye kalmaz', 'Ödenen borca ilişkin istem reddedilir'],
      ['Borçlu kısmi ödeme ileri sürerse', 'Ödeme kaydı talep edilen borçla eşlenir', 'Yalnız bir kısmın ödendiği doğrulanırsa', 'Kanıtlanan ödeme düşülür ve kalan alacakla sınırlı hüküm kurulur', enforcement ? 'İtiraz bakiye yönünden iptal edilir, ödenen kısma ilişkin talep reddedilir' : 'Bakiye alacak kabul edilir, ödenen kısım reddedilir'],
    ];
  }
  const claim = /depozito/iu.test(subject) ? 'Depozito iadesi talebi' : /tazminat/iu.test(subject) ? 'Tazminat talebi' : 'Dosyadaki talep';
  return [
    ['İstemin dayandığı olay doğrulanırsa', 'İstemin koşulları ve karşı tarafın itirazları karşılaştırılır', 'Bütün koşulların sağlandığı kabul edilirse', 'Dosyada istenen hukuki sonucun dayanağı bütünüyle kanıtlanır', claim + ' kabul edilir'],
    ['Karşı taraf belirleyici olguya itiraz ederse', 'İtirazın dayanağı dosyadaki anlatımla karşılaştırılır', 'İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse', 'Talebin dayandığı maddi koşul mevcut değildir', claim + ' koşulları oluşmadığından reddedilir'],
    ['Belirleyici olgu hakkında kayıtlar eksikse', 'Mevcut belgeler ve taraf açıklamaları birlikte incelenir', 'Araştırma sonunda ispat eksikliği giderilemezse', 'Talebin dayandığı olgu mahkemece sabit görülemez', claim + ' ispatlanamadığı için reddedilir'],
  ];
}

function settlementRoutes(criminal: boolean): Route[] {
  if (criminal) return [
    ['Uzlaştırma kapsamındaki isnatta taraflar edimsiz uzlaşırsa', 'Taraf iradeleri ve rapor incelenir', 'Geçerli edimsiz uzlaşma doğrulanırsa', 'İsnat bakımından uzlaştırma tamamlanır', 'Soruşturmada uzlaşma nedeniyle KYOK, kovuşturmada düşme kararı'],
    ['Taraflar bir edim kararlaştırırsa', 'Uzlaştırma raporu ve ifa kaydı karşılaştırılır', 'Edimin tamamının yerine getirildiği doğrulanırsa', 'Uzlaşma konusu yükümlülük tamamlanır', 'Edimin ifası üzerine soruşturmada KYOK, kovuşturmada düşme kararı'],
  ];
  return [
    ['Taraflar sulh hükümlerine göre karar verilmesini isterse', 'İmzalı sulh metni ile tarafların istemleri karşılaştırılır', 'Sulh şartları ve bu yöndeki ortak istem doğrulanırsa', 'Mahkeme uyuşmazlığı tarafların üzerinde anlaştığı koşullarla sonuçlandırır', 'Sulh sözleşmesindeki koşullara göre karar verilir'],
    ['Taraflar sulhun kayda geçirilmesini yeterli görürse', 'Sulhun kapsamı ve dosyaya sunulan beyanlar incelenir', 'Sulh bütün uyuşmazlığı kapsar ve şartlara göre hüküm istenmezse', 'Uyuşmazlık tarafların anlaşmasıyla sona erer', 'Sulh nedeniyle esas hakkında karar verilmesine yer olmadığına karar verilir'],
  ];
}

export function addCaseDecisions(nodes: ScenarioNode[], tree: ScenarioTree, file?: Case) {
  const parents = new Set(nodes.map(node => node.parent_id));
  const leaves = nodes.filter(node => !parents.has(node.id));
  const claimSource = tree.sources.find(source => source.id === 'case:claim');
  const claim = file?.claim?.trim() || claimSource?.detail || tree.title;
  const subject = claim === tree.title ? claim : claim + ' · ' + tree.title;
  const criminal = file?.case_type === 'ceza';
  const merits = routesFor(subject, criminal);
  const byId = new Map(nodes.map(node => [node.id, node]));
  // 12 tips for the largest six-scenario analysis. Expand the reasoning in
  // sparse files, and keep the same reasoning in the panel for compact trees.
  const detailed = nodes.length + leaves.length * 6 < 20;
  for (const leaf of leaves) {
    const parent = byId.get(leaf.parent_id ?? '');
    const negotiation = tree.source_mode === 'stored_analysis' && parent?.kind === 'scenario' &&
      /uzlaşması|uzlaşmaya var|sulh yoluyla|sulhla (sona|kapan)|sulh ile sonuç/iu.test(parent.label);
    const agreement = negotiation && leaf.id === parent.id + '-confirm';
    const routes = agreement ? settlementRoutes(criminal) : merits;
    if (negotiation) {
      leaf.label = agreement ? 'Taraflar anlaşmayı doğrularsa' : 'Görüşmeler anlaşmayla sonuçlanmazsa';
      leaf.description = parent.label;
      leaf.reasoning = agreement ? 'İmzalanan anlaşmanın kapsamı ve tarafların talepleri kararı belirler.' :
        'Tarafların anlaşamaması üzerine dosyanın esasına ilişkin deliller değerlendirilir.';
    }
    if (leaf.kind === 'outcome') leaf.kind = 'development';
    const sourceIds = Array.from(new Set([...leaf.source_ids, ...(claimSource ? [claimSource.id] : [])]));
    const base = {source_ids: sourceIds, uncertainties: leaf.uncertainties, probability: null,
      assessment_label: 'Hesaplanmadı' as const};
    let anchor = leaf;
    if (detailed) {
      for (const [index, label] of ['Uyuşmazlık konusu · ' + tree.title, 'İncelenen istem · ' + claim].entries()) {
        const next: ScenarioNode = {...base, id: leaf.id + ':issue:' + index, parent_id: anchor.id,
          kind: 'development', label, description: claim, reasoning: anchor.label};
        nodes.push(next);
        anchor = next;
      }
    }
    routes.forEach(([condition, check, finding, reason, decision], i) => {
      let parent = anchor;
      const steps = detailed ? [condition, check, finding, reason, decision] : [finding, decision];
      steps.forEach((label, j) => {
        const terminal = j === steps.length - 1;
        const next: ScenarioNode = {...base, id: leaf.id + ':route:' + i + ':' + j, parent_id: parent.id,
          kind: terminal ? 'outcome' : 'development', label,
          description: terminal ? 'İncelenen istem · ' + claim + '\n\nOlası karar · ' + decision :
            tree.title + ' · ' + check,
          reasoning: terminal ? finding + ', ' + reason[0].toLocaleLowerCase('tr-TR') + reason.slice(1) + '.' :
            parent.label + ' → ' + label};
        nodes.push(next);
        parent = next;
      });
    });
  }
}
