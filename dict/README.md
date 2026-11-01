# 离线词典

`ecdict-lite.tsv.gz` 由 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License，© skywind3000）精简生成：
只保留有词频 / 考试标签 / 柯林斯 / 牛津标记的单词（约 5.8 万），每行 `单词\t音标\t中文释义(\n 分隔)\t词形变化\t考试标签`。
查词时先查这里，查不到再查有道在线词典，最后才用 AI。
