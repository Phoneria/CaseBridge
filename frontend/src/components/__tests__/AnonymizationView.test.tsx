import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { anonymizeText, extractPrivacyFile } from '@/lib/api';
import { AnonymizationView } from '@/components/ai/AnonymizationView';
vi.mock('@/lib/api', () => ({anonymizeText: vi.fn(), extractPrivacyFile: vi.fn()}));
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

import { ApiError } from '@/lib/apiError';

it('loads a document, clears old result and requires explicit masking', async () => {
  vi.mocked(anonymizeText).mockResolvedValue(output);
  vi.mocked(extractPrivacyFile).mockResolvedValue({text:'file@example.test',format:'docx',warnings:['Görseller okunmadı.']});
  render(<AnonymizationView/>);
  fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'old@example.test'}});
  await userEvent.click(screen.getByRole('button',{name:'Metni maskele'}));
  expect(await screen.findByText(/E-POSTA: 1 geçiş/)).toBeVisible();
  const picker=screen.getByLabelText('Dosya yükle');
  const file=new File(['synthetic'],'sample.docx');
  await userEvent.upload(picker,file);
  await waitFor(()=>expect(screen.getByLabelText('Kaynak metin')).toHaveValue('file@example.test'));
  expect(extractPrivacyFile).toHaveBeenCalledWith(file);
  expect(screen.getByLabelText('Maskelenmiş metin')).toHaveValue('');
  expect(screen.getByText('Görseller okunmadı.')).toBeVisible();
  expect(anonymizeText).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button',{name:'Temizle'}));
  expect(picker).toHaveValue('');expect(screen.getByLabelText('Kaynak metin')).toHaveValue('');
});

it('ignores extracted text after editing or clearing the source', async () => {
  let finish!: (value: {text:string;format:'text';warnings:string[]})=>void;
  vi.mocked(extractPrivacyFile).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  render(<AnonymizationView/>);
  await userEvent.upload(screen.getByLabelText('Dosya yükle'),new File(['old'],'anything.xyz'));
  expect(screen.getByRole('button',{name:'Metni maskele'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'new'}});
  finish({text:'stale',format:'text',warnings:[]});
  await waitFor(()=>expect(screen.getByLabelText('Kaynak metin')).toHaveValue('new'));
  expect(screen.queryByText(/Okunan biçim/)).not.toBeInTheDocument();
});

it('reports file errors and rejects oversized files without preserving stale text', async () => {
  vi.mocked(extractPrivacyFile).mockRejectedValue(new ApiError('Taranmış belge için OCR gerekir.',422));
  render(<AnonymizationView/>);
  fireEvent.change(screen.getByLabelText('Kaynak metin'),{target:{value:'old'}});
  await userEvent.upload(screen.getByLabelText('Dosya yükle'),new File(['binary'],'image.bin'));
  expect(await screen.findByText('Taranmış belge için OCR gerekir.')).toBeVisible();
  expect(screen.getByLabelText('Kaynak metin')).toHaveValue('');
  const large=new File(['x'],'big.pdf');Object.defineProperty(large,'size',{value:5*1024*1024+1});
  await userEvent.upload(screen.getByLabelText('Dosya yükle'),large);
  expect(screen.getByText(/Dosya en fazla 5 MB/)).toBeVisible();
  expect(extractPrivacyFile).toHaveBeenCalledTimes(1);
});
