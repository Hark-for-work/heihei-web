# 墨墨开放 API 调研笔记

- 调研日期：2026-10-23
- 官方文档：<https://open.maimemo.com/#/>
- OpenAPI 规范：<https://open.maimemo.com/api_bundle.yaml>
- 规范规模：OpenAPI 3.1，27 个路径 / 38 个操作

## 1. 基本信息

| 项目 | 内容 |
|---|---|
| 基地址 | `https://open.maimemo.com/open` |
| 鉴权 | OIDC + Bearer Token |
| 请求头 | `Authorization: Bearer <token>` |
| Scope | `open.memo.study`、`open.memo.content`、`open.markji.content` |
| Token 获取（App） | 我的 → 更多设置 → 实验功能 → 开放 API |
| Token 获取（网页） | <https://open.maimemo.com/open/api/v1/tokens/openapi> |

文档里写的路径是 `/api/v1/...`，实际请求要带 `/open` 前缀。实测：

```bash
curl "https://open.maimemo.com/open/api/v1/memo/vocabulary?spelling=apple" \
  -H "Authorization: Bearer xxx"
```

错误统一返回：

```json
{
  "success": false,
  "errors": [{ "code": "common_unauthorized", "msg": "Authorization failed", "info": "" }]
}
```

## 2. 频控

- 10 秒 20 次
- 60 秒 40 次
- 5 小时 2000 次（墨墨背单词）
- 5 小时 8000 次（墨墨记忆卡）
- 内容创建：每天最多 600 条（例句、助记、释义合计）

注意：600 条/天限制的是**创建内容**，不是读取。读取只受上面的滚动窗口限制。

## 3. 跨域结论（关键）

实测预检请求：

```http
OPTIONS /open/api/v1/memo/study/get_today_items
Origin: http://localhost:8000
Access-Control-Request-Method: POST
```

返回 `204`，但响应里**没有** `Access-Control-Allow-Origin`。带 `Origin` 的实际 GET 同样没有。

结论：**浏览器前端不能直接调用墨墨 API**，必须经过同源代理：

- 本地：Python/Node 小服务，既托管静态页又转发请求；
- 公开部署：Cloudflare Worker / Vercel Function 等 serverless 代理。

纯静态托管（GitHub Pages、Vercel 静态、Netlify 静态）单独使用不可行。

## 4. 今日学习数据（本项目核心）

### 4.1 获取今日学习单词

```http
POST /open/api/v1/memo/study/get_today_items
Content-Type: application/json

{
  "is_finished": false,
  "is_new": false,
  "voc_ids": ["id1"],
  "spellings": ["hello"],
  "limit": 50
}
```

所有字段可选。

- `limit` 最大 1000，默认 50。
- `voc_ids` / `spellings` 最多 1000；两者不可同时使用，指定后忽略其他条件。
- 返回：

```json
{
  "today_items": [
    {
      "voc_id": "...",
      "voc_spelling": "ambiguous",
      "order": 1,
      "first_response": "VAGUE",
      "is_new": true,
      "is_finished": true
    }
  ]
}
```

`first_response` 枚举：

| 值 | 含义 |
|---|---|
| `FAMILIAR` | 认识 |
| `VAGUE` | 模糊 |
| `FORGET` | 忘记 |
| `WELL_FAMILIAR` | 熟知 |
| `CANCEL_WELL_FAMILIAR` | 取消熟知 |

重要细节：

- `first_response` 是**当天第一次反馈**，不是最终状态。一个词先标“忘记”、后来标“认识”，这里仍然是 `FORGET`。
- 未完成条目的 `first_response` 可能为空。
- 返回没有时间戳，只有学习顺序 `order`；也没有词义，只有拼写和 ID。
- 公测接口，不保证可用性和稳定性。
- 需要 App 内开启“自动同步”。
- 当天没有打开 App 完成初始化，可能取不到数据。

### 4.2 今日进度

```http
POST /open/api/v1/memo/study/get_study_progress
```

返回：

```json
{
  "progress": {
    "finished": 42,
    "total": 60,
    "study_time": 1234567
  }
}
```

`study_time` 单位毫秒。

### 4.3 查询学习记录

```http
POST /open/api/v1/memo/study/query_study_records
```

请求字段：

- `next_study_date: { start, end }`：按下次学习日期筛选，北京时区。
- `voc_ids` / `spellings`：最多 1000，二者不可同时用。
- `tags`：`STICKING`。
- `as_count`：只返回数量，不返回列表。
- `limit`：最大 1000，默认 50。

返回 `records`（`StudyRecord[]`）和 `count`。`StudyRecord` 字段：

`voc_id`、`voc_spelling`、`add_date`、`first_study_date`、`last_study_date`、`next_study_date`、`last_response`、`study_count`、`tags`。

用途：

- 获取未来某天要复习的单词数量和列表；
- 导出学习记录做数据看板；
- 用 `last_response` 交叉验证“今天最后是否仍然不认识”。

限制：**不能按“今天学习”筛选**，只能按 `next_study_date`。

### 4.4 添加单词

```http
POST /open/api/v1/memo/study/add_words

{
  "words": [{ "id": "voc_id" }],
  "advance": false
}
```

- 最多 1000 个。
- `advance: true` 可一并提前复习，无等级限制。
- 返回 `added_count`；单词上限不足或重复会影响成功数。

### 4.5 提前复习

```http
POST /open/api/v1/memo/study/advance_study

{ "voc_ids": ["id1", "id2"] }
```

- 最多 1000 个。
- 需要账号 10 级解锁提前复习。
- 返回 `advanced_count`。

## 5. 单词

```http
GET  /open/api/v1/memo/vocabulary?spelling=apple
POST /open/api/v1/memo/vocabulary/query
     { "spellings": ["apple"] } 或 { "ids": ["..."] }
```

返回只有：

```json
{ "voc": { "id": "...", "spelling": "apple" } }
```

**没有释义、音标、词性、发音。** 词义必须由大模型生成，或另接词典源。

批量查询最多 1000 个，`spellings` 和 `ids` 只能生效一个。

## 6. 内容编辑（只针对自己创建的内容）

### 6.1 例句

`/open/api/v1/memo/phrases`

- `GET ?voc_id=...`：获取该单词下**自己创建**的例句。
- `POST`：创建。
- `POST /{id}`：更新。
- `DELETE /{id}`：删除。

创建字段：

```json
{
  "phrase": {
    "voc_id": "...",
    "phrase": "This is an apple.",
    "interpretation": "这是一个苹果。",
    "tags": ["考研"],
    "origin": "考研"
  }
}
```

返回含 `highlight`（单词在例句中的高亮区间）。

### 6.2 助记

`/open/api/v1/memo/notes`

- `GET ?voc_id=...`
- `POST`
- `POST /{id}`
- `DELETE /{id}`

字段：`voc_id`、`note_type`、`note`。

### 6.3 释义

`/open/api/v1/memo/interpretations`

- `GET ?voc_id=...`
- `POST`
- `POST /{id}`
- `DELETE /{id}`

字段：`voc_id`、`interpretation`、`tags`、`status`（`PUBLISHED` / `UNPUBLISHED` / `DELETED`）。

### 6.4 云词本

`/open/api/v1/memo/notepads`

- `GET ?limit=&offset=&ids=`
- `POST`
- `GET /{id}`
- `POST /{id}`
- `DELETE /{id}`

字段：`type`（`FAVORITE` / `NOTEPAD`）、`status`、`content`、`title`、`brief`、`tags`、`list`。

`content` 两种模式：

- 章节模式：以 `#` 开头，井号后是章节名，下面一行一个单词；
- 文本模式：不以 `#` 开头，自动识别尽量多的单词和短语；开头加 `//` 则还原单词原型后再提取。

## 7. 墨墨记忆卡（Markji）

### 7.1 文件夹与牌组

- `GET /open/api/v1/markji/decks/folders`
- `GET /open/api/v1/markji/decks?offset=&limit=&folder_id=`
- `GET /open/api/v1/markji/decks/{deck}?with_root=`

只能读取**自己的自建牌组**。`with_root=true` 时返回上游牌组信息。

### 7.2 章节

- `GET /open/api/v1/markji/decks/{deck}/chapters?updated_time=&with_cards=`
- `POST /open/api/v1/markji/decks/{deck}/chapters`
- `GET /open/api/v1/markji/decks/{deck}/chapters/{chapter}?with_cards=&updated_time=`
- `POST /open/api/v1/markji/decks/{deck}/chapters/{chapter}`（改名，带 `revision`）
- `POST /open/api/v1/markji/decks/{deck}/chapters/sort`

### 7.3 卡片

- `GET /open/api/v1/markji/decks/{deck}/cards/{card}`
- `POST /open/api/v1/markji/decks/{deck}/chapters/{chapter}/cards`
- `POST /open/api/v1/markji/decks/{deck_id}/cards/{card_id}`
- `POST /open/api/v1/markji/decks/{deck}/chapters/{chapter}/cards/move`

卡片内容字段：`content`、`grammar_version`。更新章节/卡片时使用 `revision` 乐观锁，避免覆盖并发修改。

### 7.4 文件

- `POST /open/api/v1/markji/files`：`multipart/form-data`，字段名 `file`，可选 `deck_id`。
- `POST /open/api/v1/markji/files/query`：传 `ids` 和 `expires`（秒，默认 30 天），返回带签名的访问地址。

`MarkjiFile` 字段：`id`、`url`、`mime`、`size`（单位 KB，按 4KB 对齐）、`info`、`expire_time`。

### 7.5 卡片语法

- 文字样式：`[T#B#加粗]`、`[T#I#斜体]`、`[T#U#下划线]`、`[T#!e53935#红字]`、`[T#!!fff59d#高亮]`、`[T#up#2]`、`[T#down#2]`、`[T#link/"https://..."#文字]`
- 挖空：`[F#1#要隐藏的内容]`
- 音频：`[Audio#ID/音频ID#显示文字]`
- 卡片引用：`[Card#ID/卡片ID#显示文字]`
- 段落：`[P#H1#标题]`、`[P#L#列表项]`
- 选择题：`[Choice#fixed,multi#` 换行 `* 正确选项` / `- 错误选项` 换行 `]`
- 图片：`[Pic#ID/图片ID#]`；相邻无换行组成画廊
- 公式：`[E##E=mc^2]`
- 答案分隔线：单独一行 `---`
- 普通中括号转义：`\[` 和 `\]`

## 8. 明确做不到的事

- 读不到别人的公开释义、助记、例句；GET 只返回自己创建的。
- 没有公共牌组/词本搜索或下载接口。
- **不能提交复习结果**：`FAMILIAR/VAGUE/FORGET` 只出现在返回里，没有写入接口。
- 不能新建或删除牌组、文件夹；也不能删除章节、卡片。只能读取、增改、移动。
- 不能设置每日计划或复习上限。
- 单词接口没有词典数据。

## 9. 对本项目的直接影响

1. 必须有代理层（本地或 serverless）。
2. “今日错词”来自 `get_today_items`，客户端按 `first_response` 过滤。
3. 词义、例句、搭配只能由模型生成，不能从墨墨 API 获取。
4. 想回写墨墨（例句/助记/释义）可以，但每天 600 条上限，且需要处理公开状态与内容质量。
5. 不要把“自动刷复习”作为功能：没有提交接口，也不符合平台规则。
