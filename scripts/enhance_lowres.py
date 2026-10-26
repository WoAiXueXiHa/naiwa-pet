"""Offline clarity pass for the user's original low-resolution sprites.
No character regeneration. FSRCNN x4 inference + dedithering, original alpha/layout.
Run: python scripts/enhance_lowres.py <FSRCNN_x4.pb> <backup-dir>
Requires opencv-contrib-python, numpy, scipy, Pillow (build-time only).
"""
import json,sys
from pathlib import Path
import cv2,numpy as np
from scipy import ndimage
from PIL import Image,ImageOps,ImageFilter
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'assets';QA=ROOT.parent/'动作预览'
backup=Path(sys.argv[2]);backup.mkdir(parents=True,exist_ok=True)
sr=cv2.dnn_superres.DnnSuperResImpl_create();sr.readModel(sys.argv[1]);sr.setModel('fsrcnn',4)
cv2.setNumThreads(2)
manifest=json.loads((A/'manifest.json').read_text(encoding='utf8'))
comparison=Image.new('RGB',(384*2,448*2),'#f2f4e8')
for row,name in enumerate(['idle','run-right']):
    for i,frame in enumerate(manifest['animations'][name]['frames']):
        path=A/frame['file'];saved=backup/name/path.name;saved.parent.mkdir(parents=True,exist_ok=True)
        if not saved.exists():saved.write_bytes(path.read_bytes())
        original=Image.open(saved).convert('RGBA')
        low=original.resize((192,224),Image.Resampling.LANCZOS);arr=np.array(low)
        rgb=arr[:,:,:3].copy();visible=arr[:,:,3]>32
        indices=ndimage.distance_transform_edt(~visible,return_distances=False,return_indices=True)
        rgb[~visible]=rgb[indices[0][~visible],indices[1][~visible]]
        rgb=cv2.bilateralFilter(rgb,5,42 if name=='run-right' else 18,1.5)
        result=sr.upsample(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
        out=Image.fromarray(cv2.cvtColor(result,cv2.COLOR_BGR2RGB)).resize(original.size,Image.Resampling.LANCZOS)
        out=out.filter(ImageFilter.UnsharpMask(radius=.7,percent=90,threshold=2)).convert('RGBA')
        out.putalpha(original.getchannel('A'));out.save(path)
        if name=='run-right':ImageOps.mirror(out).save(A/manifest['animations']['run-left']['frames'][i]['file'])
        if i==0:
            comparison.paste(original,(0,row*448),original);comparison.paste(out,(384,row*448),out)
        if i%10==0:print(name,i,flush=True)
    if name=='idle':out.save(A/'base.png');out.resize((64,74),Image.Resampling.LANCZOS).save(A/'tray.png')
comparison.save(QA/'清晰度对比-左原版右增强.png')
Image.open(A/'base.png').save(QA/'idle.png')
previews=[]
for frame in manifest['animations']['run-right']['frames']:
    im=Image.open(A/frame['file']).convert('RGBA');bg=Image.new('RGBA',im.size,'#f2f4e8');bg.alpha_composite(im);previews.append(bg.convert('RGB'))
previews[0].save(QA/'run-right.gif',save_all=True,append_images=previews[1:],duration=[f['durationMs'] for f in manifest['animations']['run-right']['frames']],loop=0)
(QA/'clarity-processing.json').write_text(json.dumps({'model':'FSRCNN x4','method':'bilateral dedithering, local super-resolution, mild sharpening','output_size':[384,448],'alpha_and_registration_preserved':True,'native_source_detail_limited':True},ensure_ascii=False,indent=2),encoding='utf8')
print('Clarity pass complete',flush=True)
