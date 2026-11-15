/* Keep the complete card grid fixed; show the selected biography beneath it. */
(() => {
  document.querySelectorAll('.team-surface').forEach(team => {
    const list = team.querySelector('.team-list');
    if (!list) return;
    const cards = [...list.querySelectorAll('.member-details')];
    const panel = document.createElement('section');
    panel.className = 'team-profile-panel';
    panel.setAttribute('aria-label', 'Team member biography');
    panel.hidden = true;
    const profiles = cards.map((card, index) => {
      const summary = card.querySelector('summary');
      const bio = card.querySelector('.member-bio');
      summary.id = `team-member-${index + 1}`;
      bio.id = `team-biography-${index + 1}`;
      summary.setAttribute('aria-controls', bio.id);
      summary.setAttribute('aria-expanded', 'false');
      bio.setAttribute('role', 'region');
      bio.setAttribute('aria-labelledby', summary.id);
      bio.hidden = true;
      panel.append(bio);
      return {card, summary, bio};
    });
    const select = target => {
      profiles.forEach(({card, summary, bio}) => {
        const selected = card === target;
        card.open = selected;
        summary.setAttribute('aria-expanded', String(selected));
        bio.hidden = !selected;
      });
      panel.hidden = !target;
    };
    profiles.forEach(({card, summary}) => summary.addEventListener('click', event => {
      event.preventDefault();
      select(card.open ? null : card);
    }));
    select(null);
    list.after(panel);
    team.classList.add('team-profiles-stable');
  });
})();
