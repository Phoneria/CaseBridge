import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandLogo } from '@/components/BrandLogo';

it('keeps the original mark resource and removes the separate white plate', () => {
  render(<BrandLogo />);
  const image=screen.getByRole('img',{name:'CaseBridge'});
  expect(image).toHaveAttribute('src','/casebridge-logo.png');
  expect(image).toHaveAttribute('width','374');
  expect(image).toHaveAttribute('height','108');
  expect(image.parentElement).not.toHaveStyle({backgroundColor:'#fff'});
  expect(image.parentElement?.className).not.toMatch(/bg-white|rounded|px-|py-/);
});
