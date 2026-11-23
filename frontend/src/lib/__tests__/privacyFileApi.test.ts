import { afterEach, expect, it, vi } from 'vitest';
import { extractPrivacyFile } from '@/lib/api';
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it('sends raw file bytes with explicit content type and no filename or bureau identifiers',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({text:'synthetic',format:'text',warnings:[]})});
  vi.stubGlobal('fetch',fetch);localStorage.setItem('casebridge_token','synthetic-session');
  const file=new File(['synthetic'],'private-name.pdf');
  await extractPrivacyFile(file);
  const [url,options]=fetch.mock.calls[0];
  expect(url).toMatch(/\/privacy\/extract-text$/);
  expect(options.body).toBe(file);expect(options.cache).toBe('no-store');
  expect(options.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(options.headers.get('Authorization')).toBe('Bearer synthetic-session');
  expect(url).not.toContain('private-name');
});
