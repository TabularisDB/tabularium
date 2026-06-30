# plugin-turbosmtp

Tabularium 电子邮件域的 TurboSMTP 传输。注册到 `email-provider`、`email-bootstrap-driver` 和 `email-suppression-source` 扩展点。

## 功能

- **发送** 通过 `consumer_key` 身份验证调用 TurboSMTP REST API 的出站邮件。
- **引导** 从操作员的 TurboSMTP 帐户凭据初始化新实例。
- **同步** 上游抑制列表到 `email_suppression`,使用 croner 调度。
- **暴露** `/admin/email/turbosmtp` 的专属管理面板:24h 投递走势图、参与度、抑制列表、掩码凭据和 3 步引导向导。

## 原理

`buildTurboProvider(host)` 从 `host.settings` 读取凭据,构建 `TurboSmtp` 客户端。provider 自身无状态 — `plugin-email` 拥有日志、抑制 DB 和模板。

## 为何

TurboSMTP 是开发默认值:有文档化的 OAuth 风格引导、兼容的抑制 API、免费层足够运行实例演示。

## 安全停用

按依赖顺序停用:先此插件,再 `plugin-email`。

## 相关

- `plugin-email` — 协调器;此插件依赖它。
- `plugin-smtp` — 通用 SMTP 备选。
