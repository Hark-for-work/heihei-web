# 黑黑看单词

把你在**墨墨背单词**里每天标成「忘记 / 模糊」的单词，交给你自己选的大模型，织成 2–5 篇短文（考试阅读风格和小故事交替出现）。在语境里把词重新想起来，读完还能做完形、选择题和复习卡。

- **安卓 App**：装上就能用，不需要电脑。
- **电脑版**（Windows / macOS / Linux）：浏览器里使用，同一 Wi-Fi 下的手机也能访问。
- 数据都存在你自己的设备上。墨墨 Token 和模型 Key 只在你的设备和你填的服务之间传，开发者收不到任何数据。

> **声明**：本项目是个人开源作品，**不是墨墨背单词官方产品，与清远墨墨教育科技有限公司没有任何关系**。「墨墨」「墨墨背单词」「MaiMemo」是其权利人的商标。本软件只通过墨墨官方的[开放 API](https://open.maimemo.com/)、用你本人的 Token 读取你自己的学习数据。

---

## 目录

1. [下载](#下载)
2. [手机上从零开始（不需要电脑）](#手机上从零开始不需要电脑)
3. [每天怎么用](#每天怎么用)
4. [电脑版](#电脑版)
5. [手机和电脑一起用（可选）](#手机和电脑一起用可选)
6. [GitHub 备份](#github-备份)
7. [模型怎么选、怎么填](#模型怎么选怎么填)
8. [常见问题](#常见问题)
9. [隐私与安全](#隐私与安全)
10. [开发](#开发)
11. [许可与致谢](#许可与致谢)

---

## 下载

到 [Releases](https://github.com/Hark-for-work/heihei-web/releases/latest) 下载最新版：

| 你要用在 | 下载哪个 |
|---|---|
| 安卓手机（Android 8 及以上，64 位） | `momo-kan-版本号-arm64.apk` |
| 电脑 | 页面下方的 **Source code (zip)**，或 `git clone`，见[电脑版](#电脑版) |

电脑端和安卓 App 用同一个版本号，在同一个 Release 里发布。

---

## 手机上从零开始（不需要电脑）

你需要准备两样东西：**墨墨开放 API Token**（免费）和**一个大模型的 API Key**（下面以 DeepSeek 为例，按用量付费，一天几篇短文花不了几分钱）。

### 第 1 步：安装 App

1. 在手机浏览器里打开 [Releases](https://github.com/Hark-for-work/heihei-web/releases/latest)，下载 `momo-kan-…-arm64.apk`。
2. 点开下载好的文件安装。第一次装时，系统会提示「是否允许安装未知来源应用」，到设置里给浏览器或文件管理器打开这个权限再回来安装。
3. 以后有新版本，下载新的 APK 直接覆盖安装，数据会保留。

### 第 2 步：关掉「电脑同步」，让手机独立运行

打开 App → 底部「设置」→「电脑同步」→ 关掉最上面的「电脑同步」开关。

关掉以后，这台手机完全独立：数据存在手机里，不连电脑，后台也不会开 VPN。以后想和电脑一起用，再回来打开就行。

### 第 3 步：填墨墨 Token

1. 打开**墨墨背单词** App：我的 → 更多设置 → 实验功能 → **开放 API**，生成并复制 Token。
2. 回到本 App：设置 →「墨墨账号」→ 粘贴到「开放 API Token」。
3. 连接方式选「直连」，点「测试连接」，显示成功就好了。

> 墨墨 App 里要开着**自动同步**。

### 第 4 步：申请 DeepSeek API Key

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)，用手机号登录。
2. 先在「充值」里充一点钱（几块钱能用很久），然后在「API keys」里点「创建 API key」，复制 `sk-` 开头的 Key。Key 只显示一次，记得马上复制。

也可以用别的模型（OpenAI、Claude、Gemini、OpenRouter、本地的 Ollama / LM Studio 等），见[模型怎么选、怎么填](#模型怎么选怎么填)。

### 第 5 步：在 App 里配置模型

1. 设置 →「自定义模型」→「从预设新建」→ 选 **DeepSeek 官方**。
2. 预设已经填好 Base URL `https://api.deepseek.com` 和模型名，把 Key 粘贴到「API Key」。
3. 点「获取模型列表」，选一个模型（日常用 `deepseek-flash` 就够；想要更好的文笔可以选 `deepseek-v4-pro`）。
4. 点「测试连接」，显示成功就可以开始用了。

---

## 每天怎么用

1. **先在墨墨背单词里背完今天的单词。**
2. 打开本 App 的「今天」页，点「**拉取墨墨**」。会显示今天的背单词时长、忘记 / 模糊的词数和词表。
   - 如果提示「墨墨今天还没开始」：说明今天还没打开墨墨 App，墨墨服务器给的还是前一天的数据。本 App 不会把它存成今天的，先去墨墨背几个词再来拉。
3. 点「**生成短文**」。词多的话会自动分成几篇，依次生成。
4. 点进一篇短文开始读：
   - **点任意单词**看意思：目标词显示本文语境下的释义；其它生词先查离线词典或在线词典，查不到再问模型。
   - 顶部「显示选项」：字号，是否加粗忘记的词，是否给目标词加下划线（关掉就是盲读），是否显示全文中文意思。
   - 标签页：**阅读 / 词表 / 完形 / 测验 / 卡片**。完形点开看答案，选择题点选即判对错，卡片点一下翻面。
5. 右上角 **⋮** 菜单里还有：手动补词、把词加入墨墨学习计划或保存为云词本、导出 Word / PDF / Markdown。
6. 「历史」页能回看任意一天。设置 → 关于 →「**学习记录**」有热力日历、爬山（1 分钟 = 1 米，从香山一路爬到太空）和每日明细。

---

## 电脑版

### 安装

需要 **Node.js 22.13 或更高版本**（到 <https://nodejs.org> 装 LTS 版），**不需要 `npm install`**，没有任何第三方依赖。

```bash
git clone https://github.com/Hark-for-work/heihei-web.git
cd heihei-web
npm start
```

浏览器会打开 <http://127.0.0.1:8765>。按[上面的第 3–5 步](#第-3-步填墨墨-token)在「设置」里填墨墨 Token 和模型，就能用了。

### Windows 一键启动

| 文件 | 作用 |
|---|---|
| `start.bat` | 后台无窗口运行，同一 Wi-Fi 下的手机也能访问。关网页不会退出。日志在 `data/server.log` |
| `stop.bat` | 停止后台服务 |
| `start-debug.bat` | 带命令行窗口运行，方便看报错；关窗口即停止 |

用 `npm start` 时只有本机能访问，关掉网页后服务会自动退出。

### 数据放在哪

数据库在用户目录的 `黑黑看单词数据/momo.db`（从旧版升级时若已有 `墨墨看单词数据`，会继续沿用旧目录）（例如 `C:\Users\你的用户名\黑黑看单词数据`），和程序文件夹分开。更新时删掉旧程序也不会丢数据。也可以用 `--data 目录` 指定位置。

### 更多参数

```bash
npm run serve -- --port 9000              # 换端口（不自动打开浏览器）
npm run serve -- --db D:/momo/momo.db     # 换数据库位置
npm run lan                                # 允许局域网访问（= start.bat）
npm run serve -- --auto-exit              # 关闭网页后自动退出（npm start 默认开启）
npm run stop                               # 释放 8765 端口
```

---

## 手机和电脑一起用（可选）

两种方式，按需选一种。

### 方式 A：手机浏览器直接打开电脑上的页面（同一 Wi-Fi）

1. 电脑双击 `start.bat`。
2. 电脑上打开 设置 →「电脑同步」→「手机访问」，会显示手机要打开的地址，例如 `http://192.168.1.23:8765`。
3. 手机连同一个 Wi-Fi，在浏览器里打开这个地址。
4. 第一次启动时 Windows 防火墙会弹窗，勾选「专用网络」并允许。Wi-Fi 的网络类型也要设成「专用」。

### 方式 B：安卓 App 和电脑双向同步（不在一个网络也行）

App 内置了 [EasyTier](https://github.com/EasyTier/EasyTier) 虚拟组网，在外面用流量也能连回家里的电脑。

1. 电脑上安装并运行 EasyTier，建一个网络，记下**网络名称、网络密码、节点地址**（例如 `udp://1.2.3.4:11010`）和电脑的**虚拟 IP**。
2. 电脑双击 `start.bat`。
3. 手机 App：设置 →「电脑同步」→ 打开「电脑同步」开关 →「连接设置」：
   - 「手机独立模式」保持打开（推荐：页面和数据仍在手机上，连得上电脑就同步，连不上照常用）；
   - 填 EasyTier 的网络名称、密码、节点地址；
   - 「电脑页面地址」填 `电脑虚拟IP:8765`，例如 `10.10.10.1:8765`；
   - 点「保存并重新连接」。安卓同一时间只能开一个 VPN，请先关掉官方的 EasyTier App。
4. 连上以后：
   - 每 2 分钟双向同步一次学习数据，Token、模型配置和 Key 也会同步；
   - 生成短文和 AI 查词交给电脑上的模型（电脑上可以跑本地模型）；
   - 电脑不在线时，用设置里的「备用模型」（例如 DeepSeek 官方）；
   - 电脑开着、墨墨今天已打卡、还没有今天的短文时，电脑会在后台自动生成，手机打开就能看到（设置 →「电脑同步」→「电脑上的自动任务」可关闭）。

同步冲突规则：手动生成的短文优先于电脑自动生成的；同类内容按修改时间，新的为准；背单词时长以最近一次从墨墨拉取的为准。

---

## GitHub 备份

把学习时长、词表、短文和练习备份到**你自己的 GitHub 私有仓库**，换手机、重装都能找回来。备份不含墨墨 Token 和模型 Key。

1. GitHub → Settings → Developer settings → Personal access tokens：
   - classic Token：勾选 `repo`；
   - 或者 fine-grained Token：只给备份仓库 Contents 的读写权限。
2. 设置 →「数据与备份」→「GitHub 备份」→ 粘贴 Token，仓库名默认 `momo-kan-backup`（没有会自动创建为私有仓库），点「立即备份」。
3. 打开「自动备份」后，数据有变化时每 3 小时备份一次（手机上要 App 开着才会备份）。
4. 换设备后填同一个 Token 和仓库名，点「从备份恢复」。恢复是合并，不会删掉现有数据。

手机和电脑都能各自备份。开着「电脑同步」且电脑在线时，手机上看到的是电脑的备份设置。

---

## 模型怎么选、怎么填

设置 →「自定义模型」可以保存多个模型，一键切换；生成短文和点词查义可以用不同的模型（查词选快一点的）。

| 协议 | Base URL 示例 | 适用 |
|---|---|---|
| OpenAI 兼容 | `https://api.deepseek.com`、`http://127.0.0.1:8000/v1` | DeepSeek、OpenRouter、vLLM、llama.cpp、LM Studio、SGLang 等 |
| OpenAI Responses | `https://api.openai.com/v1` | OpenAI |
| Anthropic | `https://api.anthropic.com` | Claude |
| Gemini | `https://generativelanguage.googleapis.com` | Google Gemini |
| Ollama | `http://127.0.0.1:11434` | Ollama 原生接口 |

- **最大输出**：一篇短文大约要 2–4K token。思考模型建议 8192 以上，被截断时会提示调大。
- **上下文**：填模型的上下文长度（0 = 不检查）。
- **思考等级**：默认 / 关闭 / 低 / 中 / 高，支持的模型才生效。
- **代理**（电脑版）：本地 / 局域网模型选「直连」。境外服务可以选「跟随环境变量」（`HTTPS_PROXY`），或者「自定义代理」填 HTTP 代理端口，例如 `http://127.0.0.1:7890`（暂不支持 SOCKS）。
- **导入导出**：模型配置可以导出为 JSON，可选不含 Key。

其它可调的：设置 →「短文与查词」里的**备考目标**（考研、四六级、雅思、托福……，影响考试风短文和练习）、**每篇最多词数**（设了上限会自动多拆几篇）、**查词方式**。

---

## 常见问题

**拉取后提示「墨墨今天还没开始」？**
墨墨官方说明：当天没打开墨墨 App 初始化之前，学习数据接口给不出今天的准确数据。先打开墨墨背几个词，再回来拉取。

**今天拉不到词？**
确认墨墨 App 开着自动同步，并且今天已经背过。刚背完可以等一两分钟再拉。

**墨墨 Token 无效？**
在墨墨 App 里重新生成。粘贴时不用带 `Bearer `，带了也会自动去掉。

**模型连接失败？**
检查 Base URL 和 Key；先用「测试连接」看具体报错。DeepSeek 报余额不足的话，去开放平台充值。

**生成慢？**
几篇短文是依次生成的。哪篇失败了，可以单独点「重写」。

**电脑版：「需要 Node.js 22.13 或更高版本」？**
到 <https://nodejs.org> 安装 LTS 版（22 或 24）。

**电脑版：双击 start.bat 没反应？**
看 `data/server.log`，或用 `start-debug.bat` 带窗口启动看报错。

**电脑版：端口被占用？**
`npm run stop`，或者 `npm run serve -- --port 8766`。

**安卓：装不上 / 提示签名冲突？**
如果之前装过签名不同的版本，先卸载旧版再装。卸载会清掉手机上的数据，记得先做 [GitHub 备份](#github-备份)。

**有问题怎么反馈？**
在 [Issues](https://github.com/Hark-for-work/heihei-web/issues) 里提，附上 设置 → 关于 →「诊断信息」里复制出来的内容（里面的密码和 Key 已经打码）。

---

## 隐私与安全

- 墨墨 Token 和模型 API Key 存在你设备本地（浏览器 / App 的存储），每次请求直接发给墨墨或你填的模型服务，**不写进数据库、日志和 GitHub 备份**。
- 开着「电脑同步」时，Token、模型配置和 Key 会另存一份到你自己电脑上的 `settings.json`，用来在你的设备之间同步。
- 本软件没有任何服务器，不收集、不上传任何统计数据。
- 电脑版默认只监听 `127.0.0.1`。用 `start.bat` / `npm run lan` 开放局域网访问时，**没有登录密码**，只接受本机、局域网和虚拟组网网段（10.x、192.168.x、172.16–31.x、100.64–127.x）的访问。请只在自己家里的可信网络里开。
- 服务会拒绝非本机 Host 和跨站请求，防止恶意网页借 DNS rebinding 读取 Token。用域名访问（反向代理、Tailscale MagicDNS 等）时，要设置环境变量 `MOMO_ALLOWED_HOSTS=你的域名`。`deploy/` 下的 Linux 部署模板只适合一个人自用：所有访客共用同一份设置和 Token，请务必配 HTTPS 和密码。
- 安卓 App 关闭了系统备份，Token、Key 和 EasyTier 密码不会进入手机的云备份。
- 短文由你选择的大模型生成，可能有错误，请自行判断。

---

## 开发

```bash
npm test                                                         # 单元测试（node:test）
npm run mock                                                     # 终端 1：假的墨墨 + 模型服务，127.0.0.1:9177
MOMO_API_BASE=http://127.0.0.1:9177/open/api/v1 npm run serve    # 终端 2
```

mock 下 Token 随便填（填 `bad` 模拟 401），模型 Base URL 填 `http://127.0.0.1:9177/v1`。`MOCK_STALE=1 npm run mock` 模拟墨墨当天还没初始化。

```
server.js            电脑端本地服务：静态页面 + /api/*（node:http）
lib/api.js           业务接口（电脑和安卓独立模式共用）
lib/db.js            SQLite（node:sqlite）：study_log / day_words / articles / lookups，多设备同步合并
lib/momo.js          墨墨开放 API
lib/llm.js           多协议模型客户端
lib/generator.js     分批、提示词、词形校验、漏词重写、练习、查词
lib/dict.js          离线词典（ECDICT 精简版）+ 在线词典
lib/backup.js        GitHub 私有仓库备份（电脑和手机共用）
lib/net.js           HTTP 请求（直连 / HTTP 代理）
mobile/              安卓独立模式运行时；scripts/build-android-web.js 打包进 APK
android/             安卓 App（Kotlin WebView + EasyTier）
public/              前端（Vue 3 本地文件 + 手写 Material Design 3，无 CDN）
tools/mock.js        假的墨墨 + 模型服务
```

### 打包安卓 APK

推送 `v*` 标签时，GitHub Actions 会编译 EasyTier、打包 APK，附到同名 Release。正式签名密钥放在仓库 Secrets：

| Secret | 内容 |
|---|---|
| `MOMO_KEYSTORE_B64` | PKCS12 签名文件的 base64 |
| `MOMO_KEYSTORE_PASSWORD` | 密码 |
| `MOMO_KEY_ALIAS` | 别名（可选，默认 `momo`） |

没配置签名时（比如你 fork 后自己编译）会用 debug 签名，不能覆盖安装官方发布的 APK。

---

## 许可与致谢

本项目以 [MIT License](LICENSE) 开源。第三方组件和它们的许可见 [NOTICE.md](NOTICE.md)：

- [MoBeiDanCi](https://github.com/674137120/MoBeiDanCi)（MIT），本项目 v0.2.0 起在它的基础上二次开发
- [Vue 3](https://github.com/vuejs/core)（MIT）
- [ECDICT](https://github.com/skywind3000/ECDICT)（MIT），离线词典
- [思源宋体 / Noto Serif CJK](https://github.com/notofonts/noto-cjk)（SIL OFL 1.1），标题字体
- [EasyTier](https://github.com/EasyTier/EasyTier)（LGPL-3.0），安卓 App 里的虚拟组网
