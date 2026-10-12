# AI 视频创作工具导航站

聚焦「AI 视频创作」的垂直工具导航站：文生视频、AI 剪辑、数字人口播、视频翻译配音、素材生成。纯静态、零运行时依赖，所有页面由 `data/tools.json` 数据驱动生成。

## 快速开始

```bash
# 构建（零依赖，Node 18+ 即可）
node src/build.js

# 本地预览：直接双击 dist/index.html，或
npm run preview        # 构建后启动本地服务器（默认 http://localhost:4173）
```

构建产物在 `dist/` 目录，删除后重新构建不丢任何内容（真正的源在 `data/` 和 `src/`）。

## 目录结构

```
├── data/tools.json          # ★ 站点全部数据（你日常只需要改这里）
├── src/
│   ├── build.js             # 构建脚本：数据校验 + 页面渲染 + sitemap + 死链检测
│   ├── templates/           # 页面模板（改代码才会碰）
│   ├── pages/               # 关于页 / 提交页正文片段（HTML 片段）
│   └── assets/              # 样式、脚本、favicon、工具 logo
│       └── logos/           # 工具 logo 命名为 {slug}.png/svg
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
| `featured` | | `true` 时出现在首页「编辑推荐」 |
| `addedAt` / `updatedAt` | | `YYYY-MM-DD`，用于「最近更新」和 sitemap |

**新增分类**：在 `categories` 里加一条（`slug`/`name`/`description`/`icon`/`order`），无需改代码。

**预留赞助位**：`site.sponsors` 字段为后期接入预留，当前为空不影响构建。

数据校验是 fail-fast 的：必填缺失、slug 重复、分类引用错误、pricing 非法都会构建失败并指出具体字段路径，单人维护也不会把坏数据发布上线。

## SEO 与结构说明

- 每页独立 title / description / canonical，`lang="zh-CN"`，语义化标签
- 详情页带 `SoftwareApplication`、分类页带 `ItemList` 结构化数据（JSON-LD）
- 自动生成 `sitemap.xml`（含 lastmod）与 `robots.txt`（URL 取 `site.domain`，**部署前务必改成真实域名**）
- 全部链接为相对路径，可直接部署到 GitHub Pages 项目子路径或自定义域名
- 构建时自动做全站死链检测，有死链则构建失败

## 工具图标

图标在构建期抓取并本地化存储在 `src/assets/logos/{slug}.png`，不依赖任何外部图标服务（国内访问稳定、无额外请求）。

- 新工具入库后运行 `node src/fetch-logos.mjs` 自动补图标（官网 HTML 解析 → `/favicon.ico` 两级策略）
- 抓不到的走「首字母头像」兜底：按 slug 哈希取柔和色板，视觉统一
- 大图标可用 macOS `sips -Z 64 xxx.png` 压缩；`.ico` 也可用 `sips -s format png -Z 64` 转 PNG
- 当前 81 款中已有 60+ 款本地图标，剩余海外站点图标可在任意网络通畅的机器上跑一次脚本补全

## 部署

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
