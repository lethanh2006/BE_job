import { EmailSender } from '../../application/abstractions/email';
import type { EmailConfig } from '../../config/app-config';
import { LogEmailSender } from './log-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

export function createEmailSender(config: EmailConfig): EmailSender {
  return config.provider === 'Smtp' && config.smtp
    ? SmtpEmailSender.connect(config.smtp, config.from)
    : new LogEmailSender(config.logMessageBodies);
}
