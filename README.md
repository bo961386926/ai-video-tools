# AI 视频创作工具导航站

聚焦「AI 视频创作」的垂直工具导航站：文生视频、AI 剪辑、数字人口播、视频翻译配音、素材生成。纯静态、零运行时依赖，所有页面由 `data/tools.json` 数据驱动生成。

## 快速开始

```bash
# 构建（零依赖，Node 18+ 即可）
node src/build.js

# 本地预览：直接双击 dist/index.html，或
npm run preview        # 构建后启动本地服务器（默认 http://localhost:4173）

# 可视化录入工具（推荐，免手改 JSON）
npm run admin          # 启动收录工作台 → 浏览器打开 http://127.0.0.1:8787
```

构建产物在 `dist/` 目录，删除后重新构建不丢任何内容（真正的源在 `data/` 和 `src/`）。

## 目录结构

```
├── data/tools.json          # ★ 站点全部数据（你日常只需要改这里）
├── tools/
│   └── gen-og-cards.mjs     # 分享卡（og:image）生成器：本机 Chrome 截图 → src/assets/og/
├── src/
│   ├── build.js             # 构建脚本：数据校验 + 页面渲染 + sitemap + 死链检测
│   ├── admin.js             # ★ 收录工作台后端（本地 127.0.0.1:8787，零依赖 http 服务）
│   ├── admin.html           # ★ 收录工作台页面（表单 + 工具表格 + 运行日志）
│   ├── templates/           # 页面模板（改代码才会碰）
│   ├── pages/               # 关于页 / 提交页正文片段（HTML 片段）
│   └── assets/              # 样式、脚本、favicon、工具 logo
│       ├── admin/           # 收录工作台前端逻辑
│       ├── logos/           # 工具 logo 命名为 {slug}.png/svg
│       ├── og/              # 分享卡：tool/{slug}.png、category/{slug}.png、home/about/submit.png
│       └── px.gif           # 1×1 访问计数信标（透明 GIF，42 字节）
├── dist/                    # 构建产物（已 gitignore，部署时由平台生成）
└── .github/ISSUE_TEMPLATE/  # 工具提交的 GitHub Issue 表单
```

## 如何添加 / 修改工具

只需要编辑 `data/tools.json`，在 `tools` 数组中增加一条（或修改现有条目），然后重新运行 `node src/build.js`。字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `slug` | ✅ | URL 标识，`[a-z0-9-]`，全局唯一 |
| `name` | ✅ | 工具名称 |
| `category` | ✅ | 分类 slug，须存在于 `categories` |
| `tagline` | ✅ | 一句话简介（≤40 字，用于卡片和 SEO description） |
| `description` | | 详情页详细介绍，空行分段 |
| `website` | ✅ | 官网链接 |
| `pricing` | ✅ | `free` / `freemium` / `paid` / `trial` |
| `tags` | | 标签数组，如 `["文生视频","国产"]` |
| `logo` | | 本地路径 `assets/logos/xxx.png` 或外链；留空则渲染首字母头像 |
| `access` | | `direct` 国内可直连 / `proxy` 需特殊网络 / `unknown` 待核验 |
| `freeQuota` | | 免费额度的**具体**说明（≤60 字），如「注册赠送一次性 125 credits」。写具体额度才有人信，也是长尾词来源 |
| `cons` | | 一句话缺点 / 注意事项（≤80 字），如「免费额度一次性，生成排队久」 |
| `verifiedAt` | | `YYYY-MM-DD`，信息最后核验日期。详情页显示「额度与价格以官网为准」，避免额度变动后被指信息失真 |
| `rating` | | 0–5 评分（如 `4.5`），留空则不显示 ★ 评分 |
| `likes` | | 初始点赞数（整数）；访客的点赞在本地 +1，不写回数据 |
| `featured` | | `true` 时出现在首页「编辑推荐」 |
| `addedAt` / `updatedAt` | | `YYYY-MM-DD`，用于「最近更新」和 sitemap |

**新增分类**：在 `categories` 里加一条（`slug`/`name`/`description`/`icon`/`color`/`order`），无需改代码。`color` 为该分类的主题色（`#RRGGBB`），用于列表页的色点与分类卡片描边；留空则按顺序取内置色板。

**预留赞助位**：`site.sponsors` 字段为后期接入预留，当前为空不影响构建。

### 判断层字段（差异化内容）

`freeQuota` / `cons` / `access` / `verifiedAt` 这四个字段是本站与「又一个 AI 导航」的分界线：只抄工具名和官网链接，谁都做得到；写出**免费额度具体多少、国内到底能不能直接用、有什么坑**，才有被引用和被搜索的理由。

有这几个字段的详情页会多出：

- 关键信息表里的「免费额度 / 国内访问 / 注意事项 / 信息核验」四行
- 页面底部「常见问题」区块，三问由数据派生、不靠臆造：`XX 免费吗？`（pricing + freeQuota）、`XX 国内可以直接访问吗？`（access）、`XX 有哪些同类工具？`（同分类工具内链）
- 与可见区块同源的 `FAQPage` 结构化数据，以及把免费额度拼进 meta description 的搜索结果摘要

> 免费额度写具体数字、并保留 `verifiedAt`：额度会随官方政策变，页面上已注明「以官网为准」，同时核验日期本身就是可信度的一部分。**不要为了填满而编数字** —— 宁可留空，页面会自动少一行、FAQ 自动少一问。

### 站点级字段（`site`）

| 字段 | 说明 |
|---|---|
| `name` / `domain` / `description` | 站名、正式域名（canonical / sitemap / robots / og:image 都取它）、站点简介 |
| `repo` | 代码仓库地址，用于生成 Issue 入口 |
| `submitForm` | 「提交工具」的在线收集表填写地址；留空则提交页与页脚不显示表单入口 |
| `icp` | 备案号（如 `浙ICP备12345678号-1`）。有值才在页脚渲染并链接工信部查询页；工信部要求展示，同时是搜索引擎的信任信号 |

`src/pages/*.html` 是固定页正文片段，构建时支持占位符注入，避免把外部链接硬编码进 HTML：

| 占位符 | 渲染为 |
|---|---|
| `{{submitForm}}` | `site.submitForm` |
| `{{repo}}` | `site.repo` |
| `{{issueNew}}` | `site.repo` + `/issues/new?template=tool-submission.md` |

## 工具提交入口

「别人向我提交工具」有两条通道，均写入 `site` 配置后由构建自动注入页面：

1. **在线收集表（推荐）**：飞书多维表格表单，公开匿名可填，提交自动汇总成表格便于核对。配置在 `site.submitForm`。
2. **GitHub Issue**：仓库内 `.github/ISSUE_TEMPLATE/tool-submission.md` 模板，配置在 `site.repo`。

入口出现在三处：`submit.html` 的按钮区、全站页脚「在线提交表单」、首页底部 CTA 的「直接填表单」。

> 收到提交后不必手抄：本地收录工作台的[「待审核提交」面板](#待审核提交飞书收集表)可直接拉取收集表里的待审核记录，一键填入表单并回写状态。

## 列表页形态

首页与分类页的工具列表采用**横向「工具行」**（图标 + 名称 + 两行简介 + 价格胶囊 + 👍点赞），并在页面上提供：

- **统计条**：收录数 / 可免费使用数 / 国内可直连数 / 分类数 / 最近更新
- **分类快捷 chips**：彩色圆点 + 分类名 + 数量，一键跳转
- **筛选**：三个可组合的开关 —— 「全部工具 / 免费可用 / 国内直连」（`free` 与 `freemium` 视为可免费使用，`access=direct` 视为国内可直连）；「免费可用 + 国内直连」可同时开启，两个维度是 AND 关系
- **站内搜索**：按名称、简介、标签实时过滤，并自动隐藏空分类区块
- **👍 点赞**：`localStorage` 本地记录，无需后端

> 视觉参考 [AI工具宝箱](https://www.aitoollab.cn/) 的列表页：绿色主色、圆角卡片、横向工具行与分类彩色 chips。

数据校验是 fail-fast 的：必填缺失、slug 重复、分类引用错误、pricing 非法、`color` 非 `#RRGGBB`、`rating` 超出 0–5 都会构建失败并指出具体字段路径，单人维护也不会把坏数据发布上线。

## 收录工作台（可视化录入）

不想手改 JSON 时，用本地网页表单收录工具：

```bash
npm run admin        # 等价于 node src/admin.js
# → 浏览器打开 http://127.0.0.1:8787
```

**它能做什么**

- **新增 / 编辑 / 删除工具**：表单字段与 `tools.json` schema 一一对应；输入英文名自动生成 slug，中文名需手填英文标识
- **图标**：「自动抓取」按官网解析 `<link rel=icon>` → `/favicon.ico` 两级策略抓取；也可「上传图标」（png/jpg/webp/svg/ico，≤2MB）；不设则回退首字母头像
- **保存即重建**：保存后自动跑一次 `src/build.js`，`dist/` 立即刷新，日志区可见构建结果
- **一键发布**：「保存并推送 GitHub」或列表区「提交并推送」会执行 `git add -A / commit / push`，触发 GitHub Pages 自动部署

**安全约束**

- 服务**仅监听 `127.0.0.1`**，且每次启动生成随机访问令牌（内嵌页面，无需手填）。**切勿用端口转发/反代把它暴露到公网**，否则等于把「改数据 + 推仓库」的权限公开了。
- 可用环境变量覆盖：`ADMIN_PORT=8888 ADMIN_TOKEN=固定值 node src/admin.js`
- 校验规则与构建脚本完全一致，非法数据在写入前就会被拦下；**新增**时若 slug 已被占用会直接报错，不会静默覆盖已有工具。

### 待审核提交（飞书收集表）

别人通过在线收集表提交的工具，会出现在工作台顶部的「待审核提交」面板里，不用再去飞书表里手抄：

- **拉取**：点「刷新提交」调 `lark-cli` 读多维表格，逐条展示工具名称、建议 slug、分类/定价/访问情况的映射结果、标签、链接与提交者邮箱
- **风险提示**：slug 已被收录工具占用、分类未识别（原值非空但映射不到）都会在该条上标红，提醒填入后手改
- **填入表单**：一键把提交内容灌进右侧表单（slug 可改、分类需人工确认），核对后保存
- **状态回写**：新建保存成功后自动把该条在收集表里标成「已收录」；也可手动「标记已收录 / 标记已忽略」，已处理的条目可「恢复待审核」
- **显示已处理**：默认只列「待审核」，勾选右上角开关可查看全部条目
- 未配置收集表时，面板显示配置指引（而不是报错），工具增删改与构建照常可用

**配置**（每台机器一次，不入库）

```bash
cp data/submissions.example.json data/submissions.local.json
# 填写 baseToken / tableId；可选 statusField（默认「收录状态」）、tableUrl、larkCli
```

前置依赖：本机装有 `lark-cli` 且已完成飞书登录授权（工作台靠它读写多维表格）。该配置文件含 `base_token`，已在 `.gitignore` 中忽略，不会被推上仓库。

## 分享卡（og:image）

每页都有独立的分享卡：工具页、分类页、首页、关于、提交页各一张，1200×630，分享到微信 / 微博 / X / 飞书时显示工具名 + 简介 + 分类，而不是一张通用图。

- 卡片是**构建期预生成并入库**的静态 PNG，放在 `src/assets/og/`；构建脚本只校验存在性（缺图直接构建失败并提示），因此**构建本身不需要 Chrome**
- 新增工具后重新生成：

  ```bash
  node tools/gen-og-cards.mjs              # 全量生成 90 张
  node tools/gen-og-cards.mjs --only=pika  # 只生成一张（调试用）
  ```

- 生成依赖本机装有 Google Chrome（脚本走 `--headless=old` 无头截图）。在没有 Chrome 的机器上也可以正常构建与部署，只是不能新增/更新卡片；卡片入库后 CI 与服务器都不需要 Chrome
- `og:image` / `og:url` / `og:image:width` / `og:image:height` / `twitter:image` 均由模板按 `site.domain` 生成，换域名无需改代码

## 访问统计（自托管，不引第三方脚本）

只想知道「有多少人访问、看了哪些页」，用站点自己的 1×1 信标 + 服务器日志，不接入任何第三方统计：

- **信标**：每个页面在 `</body>` 前注入一段极小的 JS，向 `https://<site.domain>/assets/px.gif` 发一次 1×1 请求，带上页面路径 `p`、来源页 `r`、以及 `s=main|mirror`（主站 / GitHub Pages 镜像）
- **为什么准**：不执行 JS 的爬虫、`curl`、漏洞扫描器天然不产生信标请求，所以真人 PV 不会被爬虫灌水；本地预览（`localhost` / `127.0.0.1` / `file:`）不上报
- **隐私**：不使用 cookie、不采集个人信息、不跨站跟踪，只记录「哪个页面被打开过」与来源页；与普通 Web 服务器访问日志同级别
- **日志留存**：服务器上 `pull-edge-log.sh` 每 15 分钟把边缘容器里的 Nginx 访问日志增量落盘到宿主机（容器重建也不丢）
- **出报告**：

  ```bash
  node .workbuddy-ai/aitools/stats.mjs        # 服务器信息与脚本在已 gitignore 的目录内
  ```

  产出三样：终端摘要、`logs/report.html`（带条形图，浏览器打开）、`logs/report-<日期>.md` 快照。报告同时给出两个口径 —— 「真人浏览」（信标）与「全部流量」（含爬虫/搜索引擎抓取，用于观察收录进度与安全扫描）。

- **渠道归因（`utm_source`）**：信标只上报 pathname，不含 query，所以 `?utm_source=` 不会进 `p` 参数；但 `px.gif` 是同源子资源，浏览器请求它时会带 `Referer` = 当前页完整 URL（含 query），报告就是从这一列提取 `utm_source` 的（Referer 被裁掉时，退化为「同 IP 30 分钟内的落地页请求」匹配）。**所有对外投放的链接统一带 `?utm_source=<渠道>`**，否则报告只能看到「多了几个 PV」，分不清是谁带来的
- **两个口径别混用**：「疑似真人 IP」是启发式（浏览器 UA 且取过 CSS/JS），伪装 UA 的抓取器也会命中，数字会明显高于信标 UV；做决策一律看信标口径
- **落盘是命门**：边缘容器的 Nginx 日志写在容器可写层，容器重建即清零，宿主机 `logs/edge.log`（由 root crontab 每 15 分钟跑 `pull-edge-log.sh` 增量追加）是唯一长期留存。排查时先看 `logs/pull.log` 有没有持续在追加

## 收录推送（主动提交给搜索引擎）

被动等爬虫发现不够快：本站上线十天后实测 Baiduspider 只抓了首页 1 个页面（Googlebot 已抓 88/90），所以必须有主动通道。

```bash
node src/build.js            # 先构建，保证 sitemap / IndexNow key 文件是最新的
node scripts/push-urls.mjs --dry-run   # 只打印，不联网
node scripts/push-urls.mjs             # 增量推送（按 lastmod 判断，state 存 .workbuddy-ai/push-state.json）
```

两条通道：

- **百度主动推送**：`普通收录 → API 提交`，把 token 存到 `.workbuddy-ai/baidu.token`（不入库）。有单日配额，脚本默认每次最多推 100 条，可用 `--limit=N` 收窄
- **IndexNow**：覆盖 Bing / Yandex / Seznam，而 Bing 索引是 ChatGPT、Copilot 联网检索的重要来源之一。key 由构建时自动生成到 `.workbuddy-ai/indexnow.key`，并输出 `dist/<key>.txt`；**Key 文件必须随站点一起上线**，否则接口返回 403

Google 没有推送接口：在 Search Console 提交 `sitemap.xml` 即可，它会按 `lastmod` 自行重抓。

## SEO 与结构说明

- 每页独立 title / description / canonical，`lang="zh-CN"`，语义化标签
- 每页独立 `og:image` 分享卡 + `og:url` / `og:image:width|height` / `twitter:image`（见上文「分享卡」）
- 详情页带 `SoftwareApplication`、分类页带 `ItemList` 结构化数据（JSON-LD）
- 自动生成 `sitemap.xml`（含 lastmod）与 `robots.txt`（URL 取 `site.domain`，当前为 `https://aitools.coderx.me`）
- 全部链接为相对路径，可直接部署到 GitHub Pages 项目子路径或自定义域名
- 构建时自动做全站死链检测，有死链则构建失败

## 工具图标

图标在构建期抓取并本地化存储在 `src/assets/logos/{slug}.png`，不依赖任何外部图标服务（国内访问稳定、无额外请求）。

- 新工具入库后运行 `node src/fetch-logos.mjs` 自动补图标（官网 HTML 解析 → `/favicon.ico` 两级策略）
- 抓不到的走「首字母头像」兜底：按 slug 哈希取柔和色板，视觉统一
- 大图标可用 macOS `sips -Z 64 xxx.png` 压缩；`.ico` 也可用 `sips -s format png -Z 64` 转 PNG
- 当前 81 款中已有 60+ 款本地图标，剩余海外站点图标可在任意网络通畅的机器上跑一次脚本补全

## 部署

### 线上地址（当前）

- 主站：<https://aitools.coderx.me/> —— 全站 canonical、`sitemap.xml`、`robots.txt`、`og:image` 都指向它
- GitHub Pages 镜像：<https://bo961386926.github.io/ai-video-tools/> —— 同样可访问，但每页 canonical 指向主站，不会被搜索引擎判为重复内容
- 发布方式：脚本化发布（构建 → 上传新版本 → 原子切换 → 冒烟自测，只保留最近 5 个版本），脚本与服务器信息放在已 gitignore 的 `.workbuddy-ai/` 下，不入库
- TLS 证书由阿里云签发，有效期至 **2027-01-09**；到期前重新签发并下载后重跑证书脚本即可（该脚本也支持 `CERTBOT_EMAIL=邮箱` 的 Let's Encrypt 自动续期模式）

### Vercel（推荐，配置最少）
1. 仓库推送到 GitHub 后在 Vercel 导入；
2. Framework Preset 选 `Other`，Build Command 填 `node src/build.js`，Output Directory 填 `dist`；
3. 部署完成后在 Vercel 项目设置里绑定自定义域名，并同步修改 `data/tools.json` 里的 `site.domain`。

### GitHub Pages
仓库 Settings → Pages → Source 选 `GitHub Actions`，工作流示例：

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
permissions:
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node src/build.js
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

站点名、域名等配置都在 `data/tools.json` 的 `site` 字段中，改完重新构建即可。
