import { Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { createEmailSender } from './create-email-sender';
import { LogEmailSender } from './log-email-sender';
import { MailTransport, SmtpEmailSender } from './smtp-email-sender';

const message = {
  to: 'an@example.com',
  subject: 'Đặt lại mật khẩu JobBoard',
  text: 'Mở https://app.test/dat-lai-mat-khau?token=bi-mat-123',
  html: '<p>Xin chào</p>',
};

describe('SmtpEmailSender', () => {
  const FROM = 'JobBoard <no-reply@jobboard.vn>';

  function createTransport() {
    const sendMail = jest.fn<ReturnType<MailTransport['sendMail']>, never[]>();
    sendMail.mockResolvedValue({});
    return { transport: { sendMail } satisfies MailTransport, sendMail };
  }

  it('gửi qua transport với địa chỉ người gửi đã cấu hình', async () => {
    const { transport, sendMail } = createTransport();

    await new SmtpEmailSender(transport, FROM).send(message);

    expect(sendMail).toHaveBeenCalledWith({ from: FROM, ...message });
  });

  it.each([
    'an@example.com\r\nBcc: ke.xau@example.com',
    'an@example.com,ke.xau@example.com',
    'an@example.com;ke.xau@example.com',
    'an @example.com',
    '<an@example.com>',
    '"An" <an@example.com>',
  ])('từ chối địa chỉ có thể chèn thêm header/người nhận: %j', async (to) => {
    const { transport, sendMail } = createTransport();

    await expect(
      new SmtpEmailSender(transport, FROM).send({ ...message, to }),
    ).rejects.toThrow('Địa chỉ người nhận không hợp lệ.');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('chuyển tiếp lỗi của transport để use case ghi log', async () => {
    const { transport, sendMail } = createTransport();
    sendMail.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new SmtpEmailSender(transport, FROM).send(message),
    ).rejects.toThrow('ECONNREFUSED');
  });
});

describe('LogEmailSender', () => {
  it('in nội dung (kèm liên kết) khi được phép, để dev lấy được liên kết', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await new LogEmailSender(true).send(message);

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('token=bi-mat-123');
    log.mockRestore();
  });

  it('không in nội dung ở production vì chứa token đặt lại mật khẩu', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await new LogEmailSender(false).send(message);

    const logged = String(log.mock.calls[0][0]);
    expect(logged).toContain(message.to);
    expect(logged).toContain(message.subject);
    expect(logged).not.toContain('bi-mat-123');
    log.mockRestore();
  });
});

describe('createEmailSender', () => {
  it('mặc định ghi log; chọn Smtp khi được cấu hình', () => {
    expect(createEmailSender(AppConfig.fromEnv({}).email)).toBeInstanceOf(
      LogEmailSender,
    );
    expect(
      createEmailSender(
        AppConfig.fromEnv({
          EMAIL_PROVIDER: 'Smtp',
          SMTP_HOST: 'smtp.example.com',
        }).email,
      ),
    ).toBeInstanceOf(SmtpEmailSender);
  });
});
