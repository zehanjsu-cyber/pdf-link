# 拾页 · PDF 原始地址解析

**作者：泽涵**

输入文档所在网页的网址，查找并验证原始 PDF，提供原始地址、打开文件、复制链接和下载功能。

- **GitHub Pages 入口：** https://zehanjsu-cyber.github.io/pdf-link/
- **运行服务：** https://pdf-link-deploy-vmzdgdhc-2paxnehj.edgeone.cool

## 支持的网页

- 直接 PDF 链接。
- 普通网页中的 PDF 链接。
- `iframe`、`embed`、`object` 内嵌文档。
- PDF.js 预览地址中的 `file` 等参数。
- 高校网站的 `showVsbpdfIframe()`。
- 超星预览链接，读取 `/pc/view/preview` 返回的 PDF 地址。

解析器会读取并检查返回文件的 `%PDF-` 标识，不会把 HTML 错当成 PDF，也不会把预览图片合成为“原始文件”。无 PDF 的纯文字页、需要登录或依赖动态执行脚本的页面可能无法解析。

## 托管结构

GitHub 保存完整源码，GitHub Pages 发布 `docs/` 下的静态入口。GitHub Pages 本身不能运行服务器解析接口，所以入口通过 iframe 加载现有 EdgeOne 网站；解析和下载继续由 EdgeOne 执行。该入口需要 EdgeOne 服务保持可访问，并允许嵌入。

GitHub 和 EdgeOne 默认域名的访问情况因地区和网络而异，不保证中国大陆所有运营商的可用性。

## 文件

```text
index.html                         原始网站界面
edge-functions/api/resolve.js       通用网页解析接口
edge-functions/api/download.js      PDF 下载接口
package.json                       项目信息及测试命令
docs/index.html                    GitHub Pages 静态入口
tests/resolve.test.mjs              解析与下载流程测试
```

## 更新 EdgeOne 网站

在已登录腾讯云中国站的环境中，将本仓库根目录上传到现有项目：

```bash
npx --yes edgeone login --site china
npx --yes edgeone makers deploy . --name pdf-link-deploy-vmzdgdhc --skip-ai-gateway-sync
```

GitHub 源码更新不会自动覆盖 EdgeOne 线上服务；现有账号尚未配置 GitHub 到 EdgeOne 的持续部署凭据。

## 检查

Node.js 18+，无需安装第三方依赖：

```bash
npm test
```

测试覆盖高校预览、PDF.js、相对地址、HTML 实体、PDF 直链、超星、文件下载、EdgeOne 的 ArrayBuffer 数据块、无 PDF 页面，以及内网地址拒绝。

## 使用边界

请仅下载你有权访问的文件。工具不登录第三方账号，不绕过原站访问权限，也不承诺能够从任意网站恢复不存在或未提供的原始 PDF。
