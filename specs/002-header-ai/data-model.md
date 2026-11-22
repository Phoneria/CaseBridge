# Data Model: S03 Header yapay zekâ gezinmesi

## FeatureContract

NavigationItem.href: existing AI_ROUTES values plus accepted scenario tree; visible iff authenticated non-platform, non-restricted session; active uses exact route or slash boundary.

Latest navigation: AI_NAVIGATION is the shared nine-item route/label source for header and ordinary bureau sidebar. Sidebar group is always expanded, single column, no whole-group ring; aiLinkActive selects hub exactly and deep routes by segment. Platform/restricted accounts never get the group. Compact 24px rows, 13px labels and smaller logo/spacing fit full admin menu at desktop 900/768px, while min-h-0/overflow-y-auto retain short/mobile access.

Latest follow-up supersedes fixed compact rows: normal 256px sidebar, original logo width, logo top/settings bottom. Main/AI row groups use equal per-link flex growth from a 24px minimum, fixed heading/padding budget and a scrollable minimum content height. 768/900/1080px must fill space with growing rows, no large unused gap. AI restores b640c54 bg-navy-950/bg-ai-glow/p2/rounded-2xl panel and white/teal leaf styles; source had no active whole-group ring.
