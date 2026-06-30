# plugin-email

电子邮件领域的协调器。管理模板、投递、收件人状态和操作员 UI — 但**不**包含传输层。提供者插件(例如 `plugin-turbosmtp` 或 `plugin-smtp`)通过 `email-provider` 扩展点提供实际的发送路径。

## 功能

- **渲染** MJML 模板的事务邮件(welcome、插件已批准/已拒绝、退订确认)。
- **发送** 通过当前激活的 `email-provider`,未配置任何提供者时降级到被动队列。
- **记录** 每次发送到 `email_log`,用于诊断和按收件人的抑制检查。
- **强制执行** 退订偏好:按模板的 `email_preferences`、全局 `email_suppression`、List-Unsubscribe 头。
- **暴露** 管理员设置页 (`/admin/email`)、管理员抑制列表 (`/admin/email/suppression`)、令牌认证的用户偏好中心 (`/email/unsubscribe/[token]`)。

## 原理

`sendEmail()` 是唯一外观。通过内核注册表解析激活的提供者,运行抑制+偏好检查,使用收件人语言渲染模板,并在上游调用前后写入审计行。事件总线订阅者(`account.welcome`、`plugin.approved`、`plugin.rejected`)发出事件;此插件监听并分派。

## 为何

电子邮件是 Tabularium 与人之间的通信线路。集中投递意味着只在一个地方审计、控制和渲染;将 TurboSMTP 替换为内部 SMTP 服务器是提供者插件的更换,不是核心重构。

## 相关

- `plugin-turbosmtp` — 主要提供者。
- `plugin-smtp` — 通用 SMTP 后备。
