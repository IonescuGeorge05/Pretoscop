import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IcecatCredit } from '../icecat-credit';

describe('IcecatCredit (Open Icecat licence)', () => {
  it('names "Specs Icecat", links icecat.biz and states the AS IS disclaimer', () => {
    const html = renderToStaticMarkup(<IcecatCredit image specs />);
    expect(html).toContain('Imagine și date tehnice');
    expect(html).toContain('href="https://icecat.biz"');
    expect(html).toContain('>Specs Icecat</a>');
    expect(html).toContain('„ca atare”');
  });

  it('says what came from Icecat', () => {
    expect(renderToStaticMarkup(<IcecatCredit image specs={false} />)).toContain('Imagine:');
    expect(renderToStaticMarkup(<IcecatCredit image={false} specs />)).toContain('Date tehnice:');
  });
});
