// 目录约定：内容在 projectsDir/<期目录>/（人看、人改的东西），重文件在 buildDir/<期目录>/（中间产物与成片）
//   期目录: scenes.js · scenes/*.excalidraw.md + 贴纸 png · assets/*.png · 旁白稿.md · 字幕.srt · 封面-*.png · README.md · 发布.md
//   后台目录: work/{audio,frames,out,raw}/ 中间产物 · outputs/final.mp4 成片
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const expandFrom = (base, p) => { const e = p.replace(/^~/, process.env.HOME); return path.isAbsolute(e) ? e : path.join(base, e); };
const expand = (p) => expandFrom(ROOT, p);
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return a; };

// 环境变量 WB_CONFIG 指向另一份 config.json 时，按字段覆盖本仓库的默认配置（对象递归合并，数组整体替换），
// 让别的仓库只放期目录和自己的品牌/配音参数、引用本仓库的工具。覆盖文件里的相对路径以覆盖文件所在目录为准。
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json')));
if (process.env.WB_CONFIG) {
  const file = path.resolve(process.env.WB_CONFIG), base = path.dirname(file);
  const o = JSON.parse(fs.readFileSync(file));
  for (const [sec, key] of [['dirs', 'projects'], ['dirs', 'build'], ['bgm', 'file'], ['brand', 'logo']]) {
    if (o[sec]?.[key]) o[sec][key] = expandFrom(base, o[sec][key]);
  }
  merge(cfg, o);
}
const PROJECTS_DIR = expand(cfg.dirs.projects);
const BUILD_DIR = expand(cfg.dirs.build);

function projectPaths(projectDir) {
  const project = path.resolve(projectDir);
  const name = path.basename(project);
  const studio = path.join(BUILD_DIR, name);   // 本期的后台目录
  const build = path.join(studio, 'work');
  const outputs = path.join(studio, 'outputs');
  return {
    name, project, studio, build, outputs,
    scenes: path.join(project, 'scenes'),
    assets: path.join(project, 'assets'),
    script: path.join(project, 'scenes', 'script.json'),
    note: path.join(project, '旁白稿.md'),
    final: path.join(outputs, 'final.mp4'),
    audio: path.join(build, 'audio'),
    frames: path.join(build, 'frames'),
    out: path.join(build, 'out'),
    raw: path.join(build, 'raw'),
  };
}

// 参数可以是绝对路径、期目录名，或标题/slug 的子串（大小写不敏感）；多个匹配取最新（按名字排序最后一个）
function resolveProject(arg) {
  if (!arg) throw new Error('缺少项目参数');
  if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) return path.resolve(arg);
  const direct = path.join(PROJECTS_DIR, arg);
  if (fs.existsSync(direct)) return direct;
  const list = fs.readdirSync(PROJECTS_DIR).filter((d) => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && !d.startsWith('.'));
  const hit = list.filter((d) => d.toLowerCase().includes(arg.toLowerCase())).sort();
  if (!hit.length) throw new Error(`找不到项目「${arg}」，现有：${list.join(' | ')}`);
  return path.join(PROJECTS_DIR, hit[hit.length - 1]);
}

function listProjects() {
  return fs.readdirSync(PROJECTS_DIR).filter((d) => fs.existsSync(path.join(PROJECTS_DIR, d, 'scenes.js'))).sort();
}

module.exports = { ROOT, cfg, PROJECTS_DIR, BUILD_DIR, projectPaths, resolveProject, listProjects, expand };
