# 奶蛙桌宠

Windows x64 桌面伙伴：点击身体捧腹大笑，点击眼睛惊鸿一瞥，按住向任意方向拖动并跑步。内置 Codex 套餐额度和休息提醒。

## 从源码运行

需要 Node.js 22+、npm、Git。额度功能另需本机 Codex CLI，并使用 ChatGPT 账号登录；没有 CLI 仍可使用桌宠互动。

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

默认高度 80 逻辑像素，范围 40—360；声音开启，音量 55%。已有用户设置优先。代码不自动安装开机启动，需要时自行创建指向完整便携版 exe 的启动快捷方式。

## 额度与提醒

程序启动本机 codex app-server 读取账号和套餐额度，不读取或复制认证文件，不需要 API Key。CLI 与桌面应用可能登录不同账号，请自行核对。

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
- 额度未连接：检查 CLI 安装和登录，API Key 登录不能读取 ChatGPT 套餐额度。
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

本仓库未授予统一开源许可证。角色、GIF 和音频权利归原权利人，公开可访问不代表取得商业使用或再分发许可，复用前应取得相应授权。
