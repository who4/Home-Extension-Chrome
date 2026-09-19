// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { ApiClient } from '../api';

describe('cleanPrice', () => {
  it('parses Latin digits with commas', () => {
    expect(ApiClient.cleanPrice('1,234,567')).toBe('1,234,567');
  });

  it('normalizes Persian digits', () => {
    expect(ApiClient.cleanPrice('۱۲۳۴۵')).toBe('12345');
  });

  it('normalizes Arabic digits', () => {
    expect(ApiClient.cleanPrice('٥٦٧')).toBe('567');
  });

  it('handles Persian thousands separator U+066C', () => {
    expect(ApiClient.cleanPrice('۱٬۲۳۴٬۵۶۷')).toBe('1,234,567');
  });

  it('extracts number from mixed text', () => {
    expect(ApiClient.cleanPrice('قیمت: ۹۹٬۰۰۰ تومان')).toBe('99,000');
  });

  it('returns Error when no digits present', () => {
    expect(ApiClient.cleanPrice('no numbers here')).toBe('Error');
    expect(ApiClient.cleanPrice('')).toBe('Error');
  });
});

describe('parseProfilePage', () => {
  it('reads .info-price-left .value', () => {
    const html = '<div class="info-price-left"><span class="value">610,000</span></div>';
    expect(ApiClient.parseProfilePage(html).price).toBe('610,000');
  });

  it('falls back to generic .price selector', () => {
    expect(ApiClient.parseProfilePage('<div class="price">50,000</div>').price).toBe('50,000');
  });

  it('ignores .price without digits', () => {
    expect(ApiClient.parseProfilePage('<div class="price">N/A</div>').price).toBe('Error');
  });

  it('scrapes table row with Persian current-rate label', () => {
    const html = '<table><tr><td>نرخ فعلی</td><td>۷۰٬۰۰۰</td></tr></table>';
    expect(ApiClient.parseProfilePage(html).price).toBe('70,000');
  });

  it('returns Error on empty doc', () => {
    expect(ApiClient.parseProfilePage('<p>nothing</p>').price).toBe('Error');
  });
});
