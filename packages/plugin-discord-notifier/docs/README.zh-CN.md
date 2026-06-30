# plugin-discord-notifier

Tabularium 域事件到 Discord 频道的桥梁。监听事件总线,为操作员关心的事件发送 webhook — 通常是 `plugin.approved`、`plugin.rejected` 和 `plugin.submitted` 到审核频道。

## 功能

- **订阅** 事件:`host.events.on('plugin.*', ...)`。
- **发布** 格式化嵌入消息通过配置的 Discord webhook — 标题、插件名、操作者、时间戳、回到管理员视图的链接。
- **缓冲 + 重试** 临时 5xx 错误,使 Discord 中断不会丢失通知。

## 原理

插件从 `host.settings.get('discord.webhook')` 读取 webhook URL — 从管理员面板设置(或通过 `infra.plugins.discord.webhook`),订阅者在下次 emit 时拾取。v1 不支持每频道定制;一个 webhook → 一个频道。

## 为何

大多数操作员希望在需要审核员关注时获得实时信号。Webhook 是零基础设施(无 bot、无 token、无速率限制焦虑),Discord 是大多数插件社区已经活跃的地方。这个插件是 "Tabularium 通过事件 sink 与外界通信" 的最小可用案例 — 复制其形态构建 Slack、Mattermost 或 Telegram 变体。

## 相关

- 内核文档:事件总线 (`host.events.on/emit`)、设置接口 (`host.settings`)。
