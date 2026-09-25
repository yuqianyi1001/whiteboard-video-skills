// TTS 配音层 —— 只用阿里云百炼千问 Qwen-TTS(模型/音色由 .env BAILIAN_TTS_MODEL / BAILIAN_TTS_VOICE 指定)。每段旁白产出一个 wav, 返回真实时长。
// 时长很关键: 它决定每个分镜在时间轴上的长度(音画同步)。
// 失败就抛错、不回退到别的引擎(保证音色一致); 百炼报额度/鉴权错就去控制台处理, 别拿其它声音顶替。
// 按正文、引擎、音色、参数与 WAV 内容指纹自动复用；FORCE_TTS=1 强制重配。
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { digest, ttsIdentity, readAudioCache, writeAudioCache } from "./lib/content-cache.mjs";

// 百炼多模态生成接口, SSE 流式: 音频以 base64 分片随响应返回(结果 OSS 链接的域名在云端环境里不一定放行)。
// 请求走 curl(云端环境的出网代理对 curl 放行, Node 内置 fetch 会被拒)。
// 文档: https://help.aliyun.com/zh/model-studio/qwen-tts
const BAILIAN_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const RATE = 24000, BPS = RATE * 2;            // 返回 24kHz 单声道 16bit PCM
const SENTENCE_GAP = 0.12;                     // 句间静音秒数
const isChar = (c) => /[\p{L}\p{N}]/u.test(c);

export function getDuration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "quiet", "-show_entries", "format=duration",
    "-of", "csv=p=0", file,
  ]).toString().trim();
  return parseFloat(out) || 0;
}

export function bailianConfig(voice, env = process.env) {
  const model = env.BAILIAN_TTS_MODEL || "qwen3-tts-flash";
  const speaker = voice || env.BAILIAN_TTS_VOICE;
  if (!speaker) throw new Error("缺少千问音色: 在 .env 配 BAILIAN_TTS_VOICE(官方音色名或声音复刻音色 ID)");
  const speed = Number(env.BAILIAN_TTS_SPEED || 1);  // 合成后 atempo 倍率, 1=原速
  return { model, speaker, speed };
}

function curlPost(data) {
  const args = ["-sS", "-N", "--fail-with-body", "-m", "120", BAILIAN_URL, "--data-binary", "@-",
    "-H", "Content-Type: application/json", "-H", "X-DashScope-SSE: enable"];
  if (process.env.DASHSCOPE_API_KEY) args.push("-H", `Authorization: Bearer ${process.env.DASHSCOPE_API_KEY}`);
  return new Promise((resolve, reject) => {
    const p = execFile("curl", args, { maxBuffer: 64 << 20 }, (err, out) => (err ? reject(new Error(`${err.message.split("\n")[0]} ${String(out).slice(0, 200)}`)) : resolve(out)));
    p.stdin.end(data);
  });
}

// 合成一句, 返回原始 PCM; 失败重试 3 次
async function synthSentence(text, model, voice) {
  for (let attempt = 1; ; attempt++) {
    try {
      const body = await curlPost(JSON.stringify({ model, input: { text, voice } }));
      const chunks = [];
      for (const line of body.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const j = JSON.parse(line.slice(5));
        if (j.code) throw new Error(`${j.code} ${j.message}`);
        const d = j.output?.audio?.data;
        if (d) chunks.push(Buffer.from(d, "base64"));
      }
      let buf = Buffer.concat(chunks);
      if (buf.subarray(0, 4).toString() === "RIFF") buf = buf.subarray(buf.indexOf("data") + 8);
      if (buf.length < BPS * 0.2) throw new Error("音频过短");
      return buf;
    } catch (e) {
      if (attempt >= 3) throw new Error(`千问 TTS 合成失败「${text}」: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

// 对一段文本生成配音, 返回 { path, duration, words }。**只用千问, 失败就抛错(不回退别的引擎)**。
// 千问不返回逐字时间戳: 按句合成, 句子时长是真实的, 句内按字数均分, words 格式与字幕脚本约定一致
// [{word,startTime,endTime}](秒, 标点并入前一个字)。
export async function synthesize(text, outWav, { voice } = {}) {
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  const key = digest(ttsIdentity(text, voice));
  // 无元数据的旧 WAV 是未验证缓存，不猜测其来源。强制重配用 FORCE_TTS=1。
  const cached = process.env.FORCE_TTS !== '1' && readAudioCache(outWav, key);
  if (cached) return cached;
  const remember = audio => { writeAudioCache(outWav, key, audio); return audio; };
  // ⚠️ 占位通道: TTS_ENGINE=say 用 macOS say 出临时配音, 只为验版式/时间轴,
  //   正式出片必须删掉 wav 换回千问重配。不带逐字时间(words=[])。
  if (process.env.TTS_ENGINE === "say") {
    const aiff = outWav.replace(/\.wav$/, ".aiff");
    execFileSync("say", ["-v", process.env.SAY_VOICE || "Tingting", "-r", process.env.SAY_RATE || "200", "-o", aiff, text]);
    execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-i", aiff, "-ar", "24000", "-ac", "1", outWav]);
    fs.rmSync(aiff, { force: true });
    return remember({ path: outWav, duration: getDuration(outWav), words: [] });
  }
  const { model, speaker, speed } = bailianConfig(voice);

  const sentences = text.split(/(?<=[。？！；?!;])/).map((s) => s.trim()).filter((s) => [...s].some(isChar));
  const parts = [], words = [];
  let t = 0;
  for (const [i, s] of sentences.entries()) {
    if (i > 0) { parts.push(Buffer.alloc(Math.round(SENTENCE_GAP * RATE) * 2)); t += SENTENCE_GAP; }
    const pcm = await synthSentence(s, model, speaker);
    const dur = pcm.length / BPS;
    const chars = [...s];
    const n = chars.filter(isChar).length;
    // 句首句尾各留一点静音余量，字在中间均分
    const a = t + Math.min(0.1, dur * 0.05), step = (dur - Math.min(0.25, dur * 0.12)) / n;
    let k = 0;
    for (const c of chars) {
      if (isChar(c)) { words.push({ word: c, startTime: (a + k * step) / speed, endTime: (a + (k + 1) * step) / speed }); k++; }
      else if (words.length) words[words.length - 1].word += c;
    }
    parts.push(pcm); t += dur;
  }
  // PCM → 44100/立体声 wav(对齐管线其余环节); 变速用 atempo, 不变调
  const af = speed !== 1 ? ["-af", `atempo=${speed}`] : [];
  execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "-", ...af, "-ar", "44100", "-ac", "2", outWav],
    { input: Buffer.concat(parts), maxBuffer: 256 << 20 });
  for (const w of words) { w.startTime = +w.startTime.toFixed(3); w.endTime = +w.endTime.toFixed(3); }
  return remember({ path: outWav, duration: getDuration(outWav), words });
}

// CLI 自测凭证: node scripts/tts.mjs "要合成的文本" [输出.wav]
// (单跑时管线的 config.mjs 不会执行, 这里自己加载根目录 .env)
if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.loadEnvFile(path.resolve(import.meta.dirname, "../.env")); } catch { /* 无 .env 忽略 */ }
  const text = process.argv[2] || "你好，我是千问语音合成服务。这是一段测试旁白。";
  const out = path.resolve(process.argv[3] || "tts-test.wav");
  const r = await synthesize(text, out, {});
  console.log(`[tts] ✓ ${r.path}  时长 ${r.duration.toFixed(2)}s  字 ${r.words.length}`);
}
