import { clientKey } from './client-key';

describe('clientKey', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['::ffff:203.0.113.9', '203.0.113.9'],
    ['::FFFF:127.0.0.1', '127.0.0.1'],
  ])('IPv4 và IPv4-mapped IPv6: %s -> %s', (ip, expected) => {
    expect(clientKey(ip)).toBe(expected);
  });

  it('IPv6 gom theo /64 nên xoay địa chỉ trong cùng dải vẫn cùng khóa', () => {
    const base = clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');

    expect(base).toBe('2001:0db8:0001:0002::/64');
    expect(clientKey('2001:db8:1:2::1')).toBe(base);
    expect(clientKey('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe(base);
    expect(clientKey('2001:db8:1:3::1')).not.toBe(base);
  });

  it('xử lý dạng rút gọn "::" và zone id', () => {
    expect(clientKey('::1')).toBe('0000:0000:0000:0000::/64');
    expect(clientKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(clientKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  });

  it('thiếu hoặc không nhận diện được thì giữ nguyên/unknown', () => {
    expect(clientKey(undefined)).toBe('unknown');
    expect(clientKey('')).toBe('unknown');
    expect(clientKey('khong-phai-ip')).toBe('khong-phai-ip');
  });
});
