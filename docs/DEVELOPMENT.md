# 二次开发指南

按 README clone 并执行 npm ci，使用 `git switch -c feature/你的功能` 创建分支。npm start 构建并运行，没有热重载，修改后重启。先退出同一用户数据目录的其它实例；打包测试使用隔离目录。

提交源码、素材和锁文件，不提交依赖、构建产物或个人数据。依赖升级另开变更并单独验证。

## 添加设置

1. 在 Settings 定义类型，在 DEFAULT_SETTINGS 添加默认值。
2. 在 sanitizeSettings 添加白名单、类型及范围校验，保证旧配置缺字段仍可加载。
3. 面板添加控件，经 api.settings 更新，由主进程应用并保存。
4. 测试非法值、边界及存储兼容性，不让渲染进程直接写文件。

## 添加动作

1. 透明 PNG 放入 assets 独立目录，与现有画布、脚底位置对齐。
2. 扩展 PetAction、清单及 validateManifest 必要动作列表，指定顺序、时长和循环行为。
3. 在 pet.ts 补齐映射、触发、结束与 bridges，检查镜像及眼睛命中区。
4. 有声动作定义音频时钟和静音规则，检查快速操作及各动作间的过渡。

普通开发无需重生成素材。Python 为可选素材流水线，依赖 Pillow、numpy、scipy、rembg、onnxruntime；先阅读 ARTWORK.md 并创建分支。重建当前过渡使用 `python scripts/build_pose_bridges.py`，不要运行历史 standing_run.py 覆盖协调跑步。

## 添加提醒或额度来源

时间与阈值写为纯函数，主进程负责通知和持久化。明确去重周期、暂停及睡眠恢复行为，以固定时间测试。新来源先标准化为 QuotaWindow[]，不把原始响应交给界面。

扩展 IPC 同步 PetApi、preload 白名单及主进程处理器，校验来源和参数。不要暴露通用命令执行、任意文件读取或任意 URL 打开接口。新增模块需清理订阅和定时器。

## 验证与提交

运行 README 的 check、test、build、pack、test:package。自动测试使用模拟额度，真实额度检查可选，测试禁止读取个人认证文件。

提交前检查 git diff --cached，排除个人路径、邮箱、凭据与截图；素材复用另行确认授权。使用普通 git push，不覆盖已有历史。
