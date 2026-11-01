# 致谢、来源与第三方许可

本项目整体以 [MIT License](LICENSE) 发布。以下第三方组件按各自的许可使用，版权归原作者所有。

## 源代码

| 组件 | 用在哪 | 许可 |
|---|---|---|
| [674137120/MoBeiDanCi](https://github.com/674137120/MoBeiDanCi)（commit 9ae1953） | v0.2.0 起在它的基础上融合二次开发：Node.js 原生 HTTP 服务、墨墨开放 API 代理、Vue 3 前端、完形/选择题/复习卡、Word/PDF 导出、加入学习计划、云词本 | MIT，© 2026 MoBeiDanCi contributors（见 [LICENSE](LICENSE)） |
| [Vue 3](https://github.com/vuejs/core) v3.5 | `public/vendor/vue.global.prod.js` | MIT，© 2018-present Yuxi (Evan) You and Vue contributors |

本项目新增：每日忘记/模糊词自动拆成多篇短文、点词语境释义、SQLite 历史与学习记录、多设备同步、GitHub 备份、安卓 App、Material Design 3 界面等。

## 数据与字体

| 组件 | 用在哪 | 许可 |
|---|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) | `dict/ecdict-lite.tsv.gz`，精简后的离线词典 | MIT，© skywind3000 |
| [Noto Serif CJK SC（思源宋体）](https://github.com/notofonts/noto-cjk) Bold | `public/fonts/noto-serif-sc-bold.woff2`，按 GB2312 一级字子集化后用于大标题 | SIL Open Font License 1.1，© Adobe，全文见 [public/fonts/OFL.txt](public/fonts/OFL.txt) |

## 安卓 App 里打包的组件（不在本仓库里，CI 编译时获取）

| 组件 | 用在哪 | 许可 |
|---|---|---|
| [EasyTier](https://github.com/EasyTier/EasyTier) v2.6.4 | 虚拟组网（`libeasytier_android_jni.so` 及其 JNI 接口 `EasyTierJNI.kt`），以动态库形式随 APK 分发 | LGPL-3.0。对应源代码：<https://github.com/EasyTier/EasyTier/tree/v2.6.4>；编译方式见 `.github/workflows/android.yml`，你可以自行编译替换 APK 里的这个库 |
| AndroidX / Material Components for Android | 安卓界面 | Apache-2.0 |

## 商标

「墨墨」「墨墨背单词」「MaiMemo」是清远墨墨教育科技有限公司的商标。本项目不是墨墨官方产品，与该公司没有任何关联，只通过墨墨[开放 API](https://open.maimemo.com/) 使用用户本人的 Token 读取用户自己的学习数据。
