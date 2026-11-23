import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppUser } from '@/types';
vi.mock('next/navigation', () => ({usePathname: () => '/ai/durusma/oturum/example'}));
vi.mock('@/components/AiStatusIndicator', () => ({AiStatusIndicator: () => <span>Bağlantı durumu</span>}));
import { AiNavigation } from '@/components/AiNavigation';
import { aiLinkActive } from '@/lib/aiNavigation';
const user: AppUser = {id:'synthetic',email:'example@example.test',full_name:'Örnek',department:null,gender:null,role:'lawyer',law_firm_id:'firm-a',is_active:true};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close = function(){this.removeAttribute('open');};
});
describe('Header AI navigation', () => {
  it.each([null,{...user,is_platform_admin:true},{...user,workspace_position:'client'}])('does not expand unavailable account access', value => {
    render(<AiNavigation user={value}/>);expect(screen.queryByRole('button',{name:/CaseBridge AI/})).not.toBeInTheDocument();
  });
  it('includes all tools and preserves deep-route active state', async () => {
    render(<AiNavigation user={user}/>);await userEvent.click(screen.getByRole('button',{name:/CaseBridge AI/}));
    expect(screen.getByRole('dialog',{name:'Yapay zekâ araçları'})).toBeVisible();expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link',{name:/Olasılık Ağacı/})).toHaveAttribute('href','/ai/olasilik');
    expect(screen.getByRole('link',{name:/Canlı Duruşma/})).toHaveAttribute('aria-current','page');
    expect(screen.queryByRole('link',{name:/Genel bakış|Dosya Analizi|Yönetilen Duruşma/})).not.toBeInTheDocument();
    expect(aiLinkActive('/ai/durusma-baska','/ai/durusma')).toBe(false);
  });
  it('closes on cancellation and restores trigger focus', async () => {
    render(<AiNavigation user={user}/>);const trigger=screen.getByRole('button',{name:/CaseBridge AI/});await userEvent.click(trigger);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }));expect(trigger).toHaveAttribute('aria-expanded','false');expect(trigger).toHaveFocus();
  });
});
