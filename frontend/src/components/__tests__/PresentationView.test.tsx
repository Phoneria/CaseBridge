import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationView } from '../PresentationView';
import { PresentationEye } from '../PresentationEye';

vi.mock('@/lib/api', () => ({
  getPresentationCatalogue: async () => ({cases:[{id:'d1',title:'Depozito iadesi',client:'Kişi 1',opponent:'Kişi 2'}],contacts:[]}),
  getPresentationFile: async () => ({id:'d1',title:'Depozito iadesi',client:'Kişi 1',opponent:'Kişi 2',facts:'Kişi 1 kiracı.',closing:'İade edildi.',nodes:[],documents:[{id:'doc1',title:'Teslim tutanağı',day:'2025-01-01',text:'Kişi 1 teslim etti.'}]}),
}));

it('opens the masked file and restores the selected document with the eye',async () => {
  const click=userEvent.setup(), close=vi.fn(), open=vi.fn();
  const {unmount}=render(<PresentationEye active={false} onClick={open}/>);
  await click.click(screen.getByRole('button',{name:'Sunumda kimlikleri gizle'}));
  expect(open).toHaveBeenCalledOnce();
  unmount();
  render(<PresentationView onClose={close}/>);
  await click.click(await screen.findByRole('button',{name:/Depozito iadesi/}));
  await click.click(await screen.findByRole('button',{name:'Belgeler'}));
  await click.selectOptions(screen.getByRole('combobox'),'doc1');
  expect(await screen.findByText('Kişi 1 teslim etti.')).toBeVisible();
  expect(screen.getByRole('button',{name:'Özgün görünüme dön'})).toHaveAttribute('aria-pressed','true');
  await click.click(screen.getByRole('button',{name:'Özgün görünüme dön'}));
  expect(close).toHaveBeenCalledWith('/davalar/d1?sekme=belgeler&belge=doc1');
});
