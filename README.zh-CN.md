# ![Tabularium](assets/wordmark.svg)

> 自托管插件注册中心。基于 [Bun](https://bun.sh)、[Elysia](https://elysiajs.com)、[SvelteKit](https://kit.svelte.dev) 和 [Drizzle ORM](https://orm.drizzle.team) 构建。

🌐 **切换语言:** [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh-CN.md)

📚 **文档:** [tabularium.wiki](https://tabularium.wiki)

---

## Tabularium 是什么?

一个插件目录(或任何按 release 发布的产物),自带 Web UI、基于 OAuth 的提交流程、OpenAPI 接口和内建 CMS。作者连接 GitHub / GitLab / Gitea 账号、选一个仓库,Tabularium 自动安装 release webhook — 每个新 tag 都会成为注册中心里的一条 release。

## 特性

- 🧩 **多 Provider 提交** — GitHub、GitLab、Gitea、Forgejo(支持任意自建实例),选择仓库时即可预览 manifest
- 🔐 **签名 release** — 每个入库的 release 都会被哈希(SHA-256)并使用注册中心的 Ed25519 密钥签名;JWKS 位于 `/.well-known/registry-key.json`。若存在 GitHub build-provenance attestation,会一并转发。
- 📨 **插件请求** — 用户可在 `/requests` 提交插件请求、投票并认领(可关闭)
- 🔁 **插件转让** — 所有者可在 `/settings` 中将插件所有权在账户之间转让
- 🌐 **多语言 README** — manifest 的 `readmes:` 字段将 locale 映射到 README 路径;注册中心通过 `?locale=` 返回匹配的 README
- 📱 **桌面应用跳转** — 运维方可以注册 `tabularis://` 风格的 URL scheme;插件详情页会展示「在应用中打开」CTA
- 🏷 **插件类型** — 管理员可维护的分类法(Themes、Snippets、SQL 模板……),可按类型开启独立的公开目录子页
- 🪄 **安装向导** — 冷启动无需数据库,结构化数据库表单 + 连接测试,完成后自动登录并跳转
- 📝 **内建 CMS** — 支持 widget 的 Markdown 页面,按语言独立翻译
- 🎨 **品牌定制** — 名称、配色、Logo、favicon、统计脚本、索引策略
- 🌍 **6 种语言** — English、Deutsch、Español、Français、Italiano、中文 — 管理员可配置
- 🗄 **多方言支持** — SQLite、Postgres 或 MySQL(从 `DATABASE_URL` 自动识别)
- 🚦 **功能开关** — 无需重新部署即可关闭提交或需求功能
- 🪵 **审计日志** — 每次管理员操作都记录执行者 + IP + 目标

## 快速开始

```bash
git clone https://codeberg.org/NewtTheWolf/Tabularium
cd Tabularium
bun install
docker compose -f compose.dev.yml up -d   # postgres + dragonfly(可选)

# 终端 1
cd apps/api && bun --hot src/index.ts

# 终端 2
cd apps/frontend && bun dev
```

打开 `http://localhost:5180` — 向导会引导你完成数据库配置、运行迁移、写入默认 CMS 页面,并将 bootstrap 账号提升为真正的管理员。

首次启动时会打印 bootstrap 密码:

```
==========================================
 Tabularium install wizard
 → http://localhost:3000/welcome
 Bootstrap login:
   admin@example.com
   <自动生成的密码>
==========================================
```

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | [Bun](https://bun.sh) (≥ 1.3) |
| HTTP | [Elysia](https://elysiajs.com) + TypeBox |
| 数据库 | [Drizzle ORM](https://orm.drizzle.team) — sqlite / postgres-js / mysql2 |
| 缓存 | `Bun.redis`(兼容 Dragonfly)或内存 |
| 前端 | SvelteKit(SPA)+ [Eden Treaty](https://elysiajs.com/eden/treaty/overview) 端到端类型 |
| i18n | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) |
| 文档 | [Docsify](https://docsify.js.org) — 零构建 |

## 项目结构

```
apps/
  backend/         Elysia API + 安装向导
  frontend/        SvelteKit SPA
packages/
  client/          @tabularium/client — 类型化 Eden Treaty 客户端 (TypeScript)
  manifest/        @tabularium/manifest — 纯 validator + integrity primitives（已发布到 npm）
  cli/             @tabularium/cli — 作者侧 `tabularium validate`（已发布到 npm）
  tabularium-rs/   tabularium-sdk — 异步 Rust 客户端（已发布到 crates.io）
  tsconfig/        共享 tsconfig
deploy/            k3s manifests（镜像构建在 `.forgejo/workflows/docker-build.yml` 中运行）
docs/              Docsify 文档内容(integrity 指南、部署等)
.forgejo/          Codeberg Forgejo Actions 工作流
```

## 文档

完整文档见 **[tabularium.wiki](https://tabularium.wiki)**。

- 🚀 **[部署指南](https://tabularium.wiki/docs/#/deploy)** — Docker、环境变量、反向代理
- 🛠 **[安装向导原理](https://tabularium.wiki/docs/#/install-wizard)**
- 🔌 **[API 参考](https://tabularium.wiki/docs/#/api)** — OpenAPI spec 位于 `/openapi/json`

## 许可证

Apache 2.0 — 见 [LICENSE](LICENSE)。

## 参与贡献

欢迎在 [Codeberg](https://codeberg.org/NewtTheWolf/Tabularium) 提 issue / PR。较大改动请先开一个 discussion 对齐方向。
