# simon-skills

不露脸做视频账号的 AI skill 合集。给 AI 智能体一句选题，它查资料、写稿、配音、做画面、出封面、写各平台发布文案，交回一条能直接发的成片。

每个 skill 都来自一个真实在更新的账号，文档里的数字是实测，规则都对应踩过的坑。以 [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code) 的格式写成，Codex 这类能读写文件、跑命令的智能体也能用。

## 里面有什么

| skill | 做什么 | 成片 |
| --- | --- | --- |
| [investigation-video](skills/investigation-video/) | 商业 / 消费调查长片：事实链、真实素材拼贴、Remotion 合成、闪避配乐、八平台文案 | 10 分钟以上，横屏 |
| [whiteboard-video](skills/whiteboard-video/) | 手绘白板风"边画边讲"讲解视频：Excalidraw 风格逐笔动画、codex 生图贴纸、官方 Logo、烧录字幕、横竖封面 | 2 分钟上下，横屏 |
| [video-common](skills/video-common/) | 上面两个共用的公共工序：事实核查与来源台账、封面验收、平台文案、成片验收、合规自查 | |

### investigation-video

<img src="skills/investigation-video/assets/sample-preview.gif" width="640" alt="调查长片样片：新闻原片做主体带白描边，花字给时间与人物，底部整句字幕，左下角来源标注">

### whiteboard-video

<img src="skills/whiteboard-video/assets/sample-preview.gif" width="640" alt="白板讲解视频样片：标题一个字一个字写出来，铅笔跟着笔尖走，贴纸从左往右擦出，底部字幕，右上角品牌水印">

样片里的 "Your Brand" 和字标都是占位，改一处配置就换成你自己的。

## 安装

```bash
git clone https://github.com/trustfuture/simon-skills.git
cd simon-skills

# 装进 Claude Code（软链，以后 git pull 就是更新）
mkdir -p ~/.claude/skills
for s in investigation-video whiteboard-video video-common; do
  ln -sfn "$PWD/skills/$s" ~/.claude/skills/$s
done
```

用 Codex 的话，把上面的 `~/.claude/skills` 换成 `~/.codex/skills`。`video-common` 一定要一起装，并且跟另外两个平级，两个 skill 都按 `../video-common/` 引用它。

每个 skill 的环境和第一次跑通的步骤，看各自的 README：

- [investigation-video/README.md](skills/investigation-video/README.md)：Node、Remotion（版本固定）、FFmpeg、Python，千问 TTS 凭证（阿里云百炼）
- [whiteboard-video/README.md](skills/whiteboard-video/README.md)：Node、FFmpeg、Playwright、codex CLI，千问 TTS 凭证（阿里云百炼）；`bin/wb build` 一分钟跑出示例成片

两个 skill 的配音都走阿里云百炼千问 Qwen-TTS，凭证各放在自己目录的 `.env`，字段见各自的 `.env.example`。

## 配套文章

- [用 AI 做热点长视频：单条 108 万播放，3 天涨粉近万的实操复盘](https://x.com/HanZhang415188/status/2100857704617316717)：调查长片的选题方法、平台经验
- [百万播放的 AI 长片，流程全部开源：一句话出 10 分钟成片](https://x.com/HanZhang415188/status/2101571088891408767)：investigation-video 的逐环节说明

作者在 X：[@HanZhang415188](https://x.com/HanZhang415188)

## 许可

MIT，见 `LICENSE`。第三方字体与素材的许可在各 skill 的 README 里单独说明。
