import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { anonymizeText } from '@/lib/api';
import { AnonymizationView } from '@/components/ai/AnonymizationView';
vi.mock('@/lib/api', () => ({anonymizeText: vi.fn()}));
const output = {text:'[E-POSTA-1]',counts:{'E-POSTA':1},report:{'E-POSTA':{mod:'maskele',adet:1,farkli:1}},ner_available:false,review_required:true};
beforeEach(() => vi.clearAllMocks());
describe('AnonymizationView', () => {
  it('masks, reports, copies and clears without persisting input', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'clipboard',{value:{writeText:copy},configurable:true});
    vi.mocked(anonymizeText).mockResolvedValue(output);
    render(<AnonymizationView/>);
    expect(screen.getByRole('button',{name:'Metni maskele'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'ayse@example.test'}});
    await userEvent.click(screen.getByRole('button',{name:'Metni maskele'}));
    expect(await screen.findByText(/E-POSTA: 1 geçiş/)).toBeVisible();
    expect(screen.getByLabelText('Maskelenmiş metin')).toHaveValue('[E-POSTA-1]');
    await userEvent.click(screen.getByRole('button',{name:'Sonucu kopyala'}));
    expect(copy).toHaveBeenCalledWith('[E-POSTA-1]');
    await userEvent.click(screen.getByRole('button',{name:'Temizle'}));
    expect(screen.getByLabelText('Kaynak metin')).toHaveValue('');
    expect(screen.getByLabelText('Maskelenmiş metin')).toHaveValue('');
    expect(screen.getByRole('button',{name:'Sonucu kopyala'})).toBeDisabled();
  });
  it('discards a response after the source changes', async () => {
    let resolve!: (value: typeof output) => void;
    vi.mocked(anonymizeText).mockReturnValue(new Promise(r => {resolve=r;}));
    render(<AnonymizationView/>);
    fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'ayse@example.test'}});
    await userEvent.click(screen.getByRole('button',{name:'Metni maskele'}));
    fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'Yeni metin'}});
    resolve(output);
    await waitFor(() => expect(screen.getByLabelText('Maskelenmiş metin')).toHaveValue(''));
    expect(screen.getByRole('button',{name:'Sonucu kopyala'})).toBeDisabled();
  });
  it('shows a safe error and allows retry', async () => {
    vi.mocked(anonymizeText).mockRejectedValue(new Error('private@example.test'));
    render(<AnonymizationView/>);
    fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'Sentetik'}});
    await userEvent.click(screen.getByRole('button',{name:'Metni maskele'}));
    expect(await screen.findByText(/Maskeleme tamamlanamadı/)).toBeVisible();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Metni maskele'})).toBeEnabled();
  });
});
