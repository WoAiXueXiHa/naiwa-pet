# 奶蛙桌宠

Windows x64 桌面伙伴：点击身体捧腹大笑，点击眼睛惊鸿一瞥，按住向任意方向拖动并跑步。内置 Codex 套餐额度和休息提醒。

## 从源码运行

需要 Node.js 22+、npm、Git。额度功能只需安装 Codex 客户端并在客户端登录 ChatGPT 账号，不需要独立 CLI、CMD 或 API Key。未安装客户端时仍可使用桌宠互动。

```powershell
git clone https://github.com/WoAiXueXiHa/naiwa-pet.git
cd naiwa-pet
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd start
```

源码可放在 E 盘或其它位置。普通构建使用已提交素材，无需 Python、图像模型或在线生成服务。关闭面板后仍驻留托盘，退出用右键或托盘菜单。同一用户数据目录只允许一个实例。

## 操作

| 操作 | 效果 |
| --- | --- |
| 短按身体 | 完整大笑，主体约 3.997 秒，与笑声同步，前后有姿势过渡 |
| 短按眼睛附近 | 转头侧目，再回到待机 |
| 按住拖动 | 上下、左右、斜向及跨屏移动，左右位移决定朝向 |
| Ctrl + 滚轮 | 调整大小，设置中也可实时拖动滑杆 |
| 点击额度标签 | 打开额度面板 |
| 右键或托盘 | 设置、显示、隐藏、暂停提醒、退出 |

默认高度 80 逻辑像素，范围 40—360；声音开启，音量 55%。已有用户设置优先。登录自启动由下方安装脚本显式配置，不需要手工创建快捷方式。

开启“保持置顶”时使用 Electron 的 screen-saver 层级，在普通应用及一般置顶窗口上方显示；可在设置中关闭。Windows 锁屏、UAC 安全桌面及系统保留画面不受此设置控制。

提醒气泡位于奶蛙上方，和画布保持 16 像素间距，随显示大小调整位置；长内容在气泡内部滚动。窗口新增透明留白，奶蛙本体大小不变；旧版保存的位置会自动迁移以保持角色位置。

## 登录后自动启动，打开 Codex 后连接额度

先运行 `npm.cmd run pack`，再在项目目录安装当前 Windows 用户的联动启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-codex-startup.ps1
```

安装会创建当前用户的 Windows 计划任务并立即启动奶蛙。以后每次登录 Windows，奶蛙无需等待 Codex 即可运行和互动。

- Codex 未打开：不连接额度服务，标签显示“等待 Codex”。
- 检测到 Codex 打开：约 5 秒内开始自动连接，显示客户端账号的额度。
- Codex 退出：停止查询，保留本次奶蛙运行期间上次读取的数据并标注未更新，桌宠继续运行。
- Codex 再次打开：自动重连；自动低额度通知仍遵守原有安静时段。

计划任务另有每分钟恢复触发器。监测进程被终止后，通常在下一分钟恢复；正在运行时忽略重复触发，不重复打开奶蛙。手动退出奶蛙后不会每隔几秒强制重开，下次登录或重新启动计划任务时恢复。

脚本根据仓库位置定位程序，移动仓库后重新执行安装命令。奶蛙内部支持识别 Windows Store 的 OpenAI.Codex 包（进程名为 ChatGPT.exe）及已知桌面路径，独立 CLI 不触发额度连接。创建计划任务需要当前账号具备相应权限；任务禁用、未登录或设备睡眠期间不保证启动。

卸载联动启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-codex-startup.ps1 -Uninstall
```

卸载会停止并删除本脚本创建的计划任务，同时清理旧版本 Naiwa-Codex 快捷方式，不删除其它启动项或关闭奶蛙。执行策略参数只针对此次脚本进程，不修改系统策略。

## 额度与提醒

程序仅使用 Codex 客户端安装目录中附带的后台服务，隐藏运行并读取一份账号和额度，不查找 npm 安装或 PATH 中的独立 CLI，也不在奶蛙中发起登录。请在客户端登录或切换账号，然后点击奶蛙的“刷新额度”。每次刷新重新连接服务以加载最新登录状态，不读取或复制认证文件。

服务使用与客户端相同的 CODEX_HOME（默认客户端数据目录），不是抓取界面或接管正在运行的客户端进程。若客户端使用了自定义 CODEX_HOME，奶蛙也必须使用同一目录；不能仅凭可执行文件位置证明账号一致。界面标注客户端来源和脱敏账号，不合并或自动切换其它来源。

- 北京时间 09:00—23:00 每 30 分钟检查，支持手动刷新和协议通知，**不是秒级实时监控**。
- 剩余 20%、10%、5% 各提醒一次，跨档合并，同账号同重置周期去重。
- 读取失败保留上次有效值并标注未更新，未知值不估算。
- 10:00—22:00 整点提醒休息，跳过 12、13、18、19 点；每次可延后 10 分钟一次。
- 睡眠或退出期间不运行，恢复后不补发错过的休息提醒；勿扰模式可能抑制系统通知。

## 构建与验证

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run pack
npm.cmd run test:package
```

便携版输出到 release/win-unpacked，应完整复制文件夹，不能只复制 exe。打包测试使用隔离目录和模拟额度，不改个人设置、不要求登录；结果在 artifacts/packaged。可选真实额度检查：`npm.cmd run quota:check`。

## 故障排查

- Electron 下载失败或缺少 dist：检查网络，执行 `node node_modules/electron/install.js` 后重试；若选择镜像，请自行确认可信度。
- 额度未连接：检查客户端安装与登录，在客户端使用 ChatGPT 账号后刷新，不需要打开 CMD。
- 计划任务启动不依赖 Codex 注入的 PATH：程序只查找本机客户端安装目录内的服务，不固定版本目录名，不复制登录文件。
- 面板加载失败会显示重试入口；读取额度失败时面板仍可使用，重新加载面板不等于重新登录。
- 素材缺失：重新拉取完整仓库，不要只复制 src。核心素材损坏会提示，缺失过渡安全跳过。
- 配置未保存：检查用户数据目录写入权限。损坏配置保留 .corrupt-时间戳 副本后使用默认值。
- 桌宠消失：托盘选择“显示奶蛙”，显示器断开后尝试恢复可见位置。
- E 盘启动出现 `Sandboxed processes cannot read`：这是目录 ACL 问题。在项目目录执行下方命令，仅给程序目录添加沙箱读取权限，不要关闭 Electron 沙箱：

```powershell
icacls '.\release\win-unpacked' /grant '*S-1-15-2-1:(OI)(CI)(RX)' /T /Q
# 若源码启动也遇到同一错误：
icacls '.\node_modules\electron\dist' /grant '*S-1-15-2-1:(OI)(CI)(RX)' /T /Q
```

## 隐私与二次开发

个人配置在 `%APPDATA%/naiwa-desktop/settings.json`，包含大小、位置、偏好和去重记录，不包含登录凭据。

- [架构说明](docs/ARCHITECTURE.md)：职责与数据流。
- [开发指南](docs/DEVELOPMENT.md)：增加动作、设置和提醒。
- [隐私说明](docs/PRIVACY.md)：本地数据与诊断边界。
- [审查报告](docs/REVIEW.md)：修复及验证结果。
- [素材来源](assets/ARTWORK.md) 与 [使用权说明](ASSET_RIGHTS.md)。

## 开源与贡献

原创代码和项目文档采用 [MIT 许可证](LICENSE)，欢迎任何开发者自由使用、修改、分发、商业使用或开发自己的版本。欢迎通过 Issue 提出建议，或 Fork 仓库提交 Pull Request；开发流程见 [开发指南](docs/DEVELOPMENT.md)。

MIT 授权不覆盖第三方角色、图片、GIF、音频及其衍生素材。这些权利归原权利人，复用或分发前应取得相应授权；也可以替换成自己的形象和声音。
