import { isIPv6 } from 'node:net';

/**
 * Rút gọn IP thành khóa giới hạn tần suất: IPv4-mapped về IPv4; IPv6 gom theo /64 vì một thiết bị
 * thường được cấp cả dải nên xoay địa chỉ trong dải không được tính là máy khác.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';

  const address = ip.split('%')[0].toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];
  if (!isIPv6(address) || address.includes('.')) return address;

  const [left, right] = address.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const groups = address.includes('::')
    ? [
        ...head,
        ...Array<string>(8 - head.length - tail.length).fill('0'),
        ...tail,
      ]
    : head;

  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}
