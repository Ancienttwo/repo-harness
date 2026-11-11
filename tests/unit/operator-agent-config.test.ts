import { describe, expect, test } from 'bun:test';
import { publicAgentConfigText } from '../../src/core/operator/agent-config';

const keyBlock = (label: string, value: string, open = '-----', close = '-----') => `${open}BEGIN ${label}${close}\n${value}\n${open}END ${label}${close}`;
const credentialFixtures = [
  { label: 'Basic authorization', text: 'Authorization: Basic U1lOVEhFVElDOlNFQ1JFVA==', value: 'U1lOVEhFVElDOlNFQ1JFVA==' },
  { label: 'Digest authorization', text: 'Proxy-Authorization: Digest username=synthetic, response=FAKE_DIGEST_VALUE', value: 'FAKE_DIGEST_VALUE' },
  { label: 'Bearer header', text: 'Authorization: Bearer FAKE_BEARER_VALUE', value: 'FAKE_BEARER_VALUE' },
  { label: 'short auth payload', text: 'Basic abc', value: 'abc' },
  { label: 'encrypted PEM', text: '-----BEGIN ENCRYPTED PRIVATE KEY-----\nFAKE_PEM_BODY\n-----END ENCRYPTED PRIVATE KEY-----', value: 'FAKE_PEM_BODY' },
  { label: 'OpenSSH PEM', text: '-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE_SSH_BODY\n-----END OPENSSH PRIVATE KEY-----', value: 'FAKE_SSH_BODY' },
  { label: 'unterminated PEM', text: '-----BEGIN PRIVATE KEY-----\nFAKE_UNCLOSED_BODY', value: 'FAKE_UNCLOSED_BODY' },
  { label: 'RSA-PSS PEM', text: keyBlock('RSA-PSS PRIVATE KEY', 'FAKE_PSS_BODY'), value: 'FAKE_PSS_BODY' },
  { label: 'PGP private armor', text: keyBlock('PGP PRIVATE KEY BLOCK', 'FAKE_PGP_BODY'), value: 'FAKE_PGP_BODY' },
  { label: 'PGP secret armor', text: keyBlock('PGP SECRET KEY BLOCK', 'FAKE_OLD_PGP_BODY'), value: 'FAKE_OLD_PGP_BODY' },
  { label: 'ssh.com export', text: keyBlock('SSH2 ENCRYPTED PRIVATE KEY', 'FAKE_SSH2_BODY', '---- ', ' ----'), value: 'FAKE_SSH2_BODY' },
  { label: 'CLI api key', text: 'curl --api-key FAKE_CLI_VALUE', value: 'FAKE_CLI_VALUE' },
  { label: 'CLI quoted password', text: 'tool --password "FAKE_QUOTED_VALUE with spaces"', value: 'FAKE_QUOTED_VALUE' },
  { label: 'CLI key option', text: 'tool --key=FAKE_KEY_VALUE', value: 'FAKE_KEY_VALUE' },
  { label: 'curl short user option', text: 'curl -u user:FAKE_USER_PASSWORD', value: 'FAKE_USER_PASSWORD' },
  { label: 'curl short header option', text: 'curl -H \"X-Key: FAKE_HEADER_VALUE\"', value: 'FAKE_HEADER_VALUE' },
  { label: 'multiline assignment', text: 'password: |\n  FAKE_FIRST_LINE\n  FAKE_LAST_LINE', value: 'FAKE_LAST_LINE' },
  { label: 'escaped quote assignment', text: 'token="prefix\\"FAKE_SUFFIX_VALUE"', value: 'FAKE_SUFFIX_VALUE' },
  { label: 'cookie header', text: 'Set-Cookie: session=FAKE_COOKIE_VALUE; HttpOnly', value: 'FAKE_COOKIE_VALUE' },
  { label: 'connection credentials', text: 'postgres://user:FAKE_CONNECTION_VALUE@example.invalid/db', value: 'FAKE_CONNECTION_VALUE' },
  { label: 'Slack webhook', text: 'https://hooks.slack.com/services/TFAKE/BFAKE/FAKE_WEBHOOK_VALUE', value: 'FAKE_WEBHOOK_VALUE' },
  { label: 'Discord webhook', text: 'https://discord.com/api/webhooks/123/FAKE_DISCORD_VALUE', value: 'FAKE_DISCORD_VALUE' },
  { label: 'Telegram bot URL', text: 'https://api.telegram.org/bot123456:FAKE_TELEGRAM_VALUE/getMe', value: 'FAKE_TELEGRAM_VALUE' },
  { label: 'URL query secret', text: 'https://example.invalid/endpoint?token=FAKE_QUERY_VALUE', value: 'FAKE_QUERY_VALUE' },
  { label: 'GitHub token', text: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', value: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  { label: 'OpenAI-shaped token', text: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', value: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  { label: 'AWS-shaped key', text: 'AKIAABCDEFGHIJKLMNOP', value: 'AKIAABCDEFGHIJKLMNOP' },
  { label: 'Slack-shaped token', text: 'xoxb-FAKE-SLACK-VALUE', value: 'xoxb-FAKE-SLACK-VALUE' },
  { label: 'JWT-shaped token', text: 'eyJabcdefghijk.abcdefghijklm.abcdefghijklm', value: 'eyJabcdefghijk.abcdefghijklm.abcdefghijklm' },
] as const;

describe('publicAgentConfigText', () => {
  for (const fixture of credentialFixtures) {
    test(`suppresses the entire ${fixture.label} field`, () => {
      const out = publicAgentConfigText(`before\n${fixture.text}\nafter`);
      expect(out).toBe('[configured]');
      expect(out).not.toContain(fixture.value);
    });
  }
  test('hides private absolute paths and control bytes, and is idempotent', () => {
    for (const text of ['/Users/synthetic/private', '/home/synthetic/private', 'C:\\Users\\synthetic\\private', '/tmp/synthetic']) {
      expect(publicAgentConfigText(text)).toBe('[private path]');
    }
    expect(publicAgentConfigText('bad\0text')).toBe('[unavailable]');
    for (const text of ['[configured]', '[private path]', '[unavailable]', 'Use tests before committing.']) expect(publicAgentConfigText(publicAgentConfigText(text))).toBe(publicAgentConfigText(text));
  });
  test('shared credential labels recognize space, underscore, hyphen, and joined forms', () => {
    for (const words of [['API', 'key'], ['private', 'key'], ['access', 'key'], ['signing', 'key']]) {
      for (const separator of [' ', '_', '-', '']) {
        expect(publicAgentConfigText(`${words.join(separator)}: SYNTHETIC_LABEL_VALUE`)).toBe('[configured]');
      }
    }
  });
});
