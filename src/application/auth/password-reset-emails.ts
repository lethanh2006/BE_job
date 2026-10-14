import type { EmailMessage } from '../abstractions/email';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Khung HTML đơn giản, style nội tuyến vì ứng dụng thư không đọc được CSS ngoài. */
function layout(
  heading: string,
  paragraphs: string[],
  button?: string,
): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#142c28">
<h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
${paragraphs.map((text) => `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${text}</p>`).join('\n')}
${button ?? ''}
<p style="font-size:12px;color:#65736f;margin:24px 0 0">JobBoard</p>
</div>`;
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  link: string;
  validMinutes: number;
}): EmailMessage {
  const { to, name, link, validMinutes } = input;
  const button = `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#1f725d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Đặt lại mật khẩu</a></p>
<p style="font-size:12px;line-height:1.5;color:#65736f;margin:0 0 14px;word-break:break-all">Nếu nút không mở được, hãy dán liên kết này vào trình duyệt:<br>${escapeHtml(link)}</p>`;

  return {
    to,
    subject: 'Đặt lại mật khẩu JobBoard',
    text: [
      `Xin chào ${name},`,
      '',
      'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản JobBoard của bạn.',
      `Mở liên kết sau để chọn mật khẩu mới (có hiệu lực ${validMinutes} phút và chỉ dùng được một lần):`,
      '',
      link,
      '',
      'Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.',
      '',
      'JobBoard',
    ].join('\n'),
    html: layout(
      'Đặt lại mật khẩu',
      [
        `Xin chào ${escapeHtml(name)},`,
        'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản JobBoard của bạn. ' +
          `Liên kết có hiệu lực ${validMinutes} phút và chỉ dùng được một lần.`,
        'Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.',
      ],
      button,
    ),
  };
}

export function passwordChangedEmail(input: {
  to: string;
  name: string;
}): EmailMessage {
  const { to, name } = input;
  return {
    to,
    subject: 'Mật khẩu JobBoard của bạn đã được đặt lại',
    text: [
      `Xin chào ${name},`,
      '',
      'Mật khẩu tài khoản JobBoard của bạn vừa được đặt lại và mọi phiên đăng nhập cũ đã bị đăng xuất.',
      'Nếu không phải bạn thực hiện, hãy dùng chức năng "Quên mật khẩu" để đặt lại ngay và liên hệ quản trị viên.',
      '',
      'JobBoard',
    ].join('\n'),
    html: layout('Mật khẩu đã được đặt lại', [
      `Xin chào ${escapeHtml(name)},`,
      'Mật khẩu tài khoản JobBoard của bạn vừa được đặt lại và mọi phiên đăng nhập cũ đã bị đăng xuất.',
      'Nếu không phải bạn thực hiện, hãy dùng chức năng “Quên mật khẩu” để đặt lại ngay và liên hệ quản trị viên.',
    ]),
  };
}
