# plugin-smtp

Tabularium 电子邮件域的通用 SMTP 传输。注册到 `email-provider` 扩展点。当你已经运营 SMTP 中继(Postfix、Postal、SendGrid SMTP)且不想使用 TurboSMTP 时使用此插件。

## 功能

- **发送** 通过 `nodemailer` 使用 STARTTLS 或隐式 TLS 发送出站邮件 — 由插件设置中的 host/port/凭据驱动。
- **验证** 在管理员邮件页面提交凭据前用 "Test connection" 探测连接性。

## 原理

`buildSmtpProvider(host)` 读取设置(`smtpHost`、`smtpPort`、`smtpUser`、`smtpPass`、`smtpFrom`),构建 `nodemailer` 传输器,暴露 `send()` 方法。SMTP 不贡献抑制源 — 通用 SMTP 服务器没有统一的抑制 API,所以 `plugin-email` 通过 `/admin/email/suppression` 手动管理抑制。

## 为何

不是每个操作员都想要第三方 provider。SMTP 是通用逃生口:任何合规中继都可用。也使隔离网络的 Tabularium 安装成为可能 — 指向内部 Postfix 即可发邮件,不触及公网。

## 相关

- `plugin-email` — 协调器;此插件依赖它。
- `plugin-turbosmtp` — 带引导 + 抑制同步的 first-party provider。
