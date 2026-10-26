# 原始素材处理

当前待机取 `final.gif` 第 0 帧，侧目取 24—53 帧，大笑取 54—165 帧再按下文压缩到音频时长。完整跑步由 imagegen 以同一站立形象为身份参考制作，共8帧/方向，每帧90ms，包含摆臂、对侧腿迈动和身体起伏。起停、转身和收尾使用实际中间姿势，详见 motion-sources/README.md。旧 `idle-original.png`、`run.gif`、`laugh.gif` 只归档，不参与当前运行。

源文件来自用户，并随源码保存在 `references/`。笑声音频为用户提供的 MP3，默认开启，音量 55%。GIF 本身分辨率较低，原始 GIF 中的抖动、压缩噪点、缺失的画面边缘不会通过重绘“补齐”。

背景移除使用本地 rembg / U2Net，只产生透明蒙版；没有把原文件发送给在线抠图服务。一次动作的所有帧使用共同裁剪边界、共同缩放和注册位置，保留源素材里的身体起伏。左跑对右跑逐帧镜像，不反转时间顺序。

「最终版本.gif」中第 13—64、76—109 帧带有播放器覆盖。脚部 y>=1040 区域由同一 GIF 的干净帧 0、65、75、110 局部替换，保留角色的脚，避免通过裁掉底部隐藏进度条。此修复替换的是原始素材中的像素，不是生成重绘。

处理脚本：先执行 `scripts/process_originals.py`，再执行 `scripts/process_final.py`。复现需要 Pillow、rembg、onnxruntime、numpy、scipy；设置 `U2NET_HOME` 指向自己的模型缓存目录，`NAIWA_MATTING_MODEL=u2net`。普通运行和打包不需要 Python 或模型。

背景移除工具：https://github.com/danielgatis/rembg

U2NetP 模型下载和校验依据：https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py

早期不同形象的生成图、旧腿部单独摆动版本、重影的光流过渡实验均已弃用。当前生成姿势以最后确认的高清站立形象为参考；用户指定删除的三张眯眼歪笑姿势不在当前过渡中。

## 历史清晰化处理（当前已停用）

待机和跑步的源图较小，另做本地 FSRCNN x4 超分辨率、双边去抖色噪与轻微锐化。输出统一为 384×448，与大笑/侧目精灵帧相同；透明蒙版、动作注册位置和原始帧时长不变。它改善边缘与噪点，不等于恢复高分辨率源图的真实细节。

用户随后要求改用高清站立形象，以上低清晰化版本已停用。当前选定的素材已完整包含在项目中，普通构建无需重做图片。需要重建过渡时运行 `scripts/build_pose_bridges.py`（无参数）；不要运行旧清晰化或 standing_run.py 覆盖当前协调跑步素材。

脚本：`scripts/enhance_lowres.py`，构建时依赖 opencv-contrib-python。模型来源：https://github.com/Saafke/FSRCNN_Tensorflow （Apache-2.0）。运行程序不需要下载模型。

## 大笑播放时长

按用户要求，运行 `scripts/retime_laugh.py` 将完整的 112 帧大笑按比例加速，从原始 8470 ms 压缩到音频的 3996.688 ms。音频只播放一次；应用开启声音时以音频播放位置同步动画。原始帧图像和动作顺序不变。重新提取 final.gif 后需再运行此脚本。
