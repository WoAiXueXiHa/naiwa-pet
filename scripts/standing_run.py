"""Use final.gif's clean standing frame as idle and a pixel puppet for running.
No low-resolution run.gif or generated replacement character is used.
"""
from pathlib import Path
import json,math
import numpy as np
from scipy import ndimage
from PIL import Image,ImageOps,ImageFilter
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'assets';QA=ROOT.parent/'动作预览'
manifest=json.loads((A/'manifest.json').read_text(encoding='utf8'))
source=Image.open(A/'frames/glance/000.png').convert('RGBA')
w,h=source.size
idle_path=A/'frames/idle/000.png';source.save(idle_path);source.save(A/'base.png');source.save(QA/'idle.png')
source.resize((64,74),Image.Resampling.LANCZOS).save(A/'tray.png')
manifest['animations']['idle']={'frames':[{'file':'frames/idle/000.png','durationMs':1000,'eyes':manifest['animations']['glance']['frames'][0].get('eyes',[])}],'fps':1,'loop':True}
manifest['animations']['stretch']={'frames':manifest['animations']['idle']['frames'],'fps':1,'loop':False}
rgba=np.array(source);yy,xx=np.indices((h,w));alpha=rgba[:,:,3]
def piece(mask):
    out=rgba.copy();out[:,:,3]=np.where(mask,alpha,0);return Image.fromarray(out)
body=piece(yy<=319)
legs=[]
for left,pivot,knee in [(True,(175,307),(164,352)),(False,(232,309),(238,365))]:
    region=(yy>=296)&((xx<202) if left else (xx>=202))
    labels,n=ndimage.label(region&(alpha>20));sizes=np.bincount(labels.ravel());sizes[0]=0
    region=labels==int(sizes.argmax())
    legs.append((piece(region&(yy<=knee[1]+5)),piece(region&(yy>=knee[1]-5)),pivot,knee))
def translate(x,y):return np.array([[1.,0.,x],[0.,1.,y],[0.,0.,1.]])
def rotate(angle,pivot):
    c,s=math.cos(math.radians(angle)),math.sin(math.radians(angle))
    return translate(*pivot)@np.array([[c,-s,0],[s,c,0],[0,0,1.]])@translate(-pivot[0],-pivot[1])
def transform(im,matrix):
    inverse=np.linalg.inv(matrix)
    return im.convert('RGBa').transform((w,h),Image.Transform.AFFINE,tuple(inverse[:2].ravel()),Image.Resampling.BICUBIC).convert('RGBA')
left_frames=[]
for i in range(16):
    phase=2*math.pi*i/16;dy=-5*abs(math.sin(2*phase));shift=translate(0,dy)
    frame=Image.new('RGBA',(w,h))
    for n,(upper,lower,pivot,knee) in enumerate(legs):
        swing=math.sin(phase+n*math.pi);hip=rotate(22*swing,pivot)
        bend=rotate(-42*max(0,-swing),knee)
        frame.alpha_composite(transform(lower,shift@hip@bend))
        frame.alpha_composite(transform(upper,shift@hip))
    frame.alpha_composite(transform(body,shift))
    fa=np.array(frame);labels,n=ndimage.label(fa[:,:,3]>20);sizes=np.bincount(labels.ravel());sizes[0]=0
    fa[:,:,3][sizes[labels]<25]=0
    left_frames.append(Image.fromarray(fa))
for name,frames in [('run-left',left_frames),('run-right',[ImageOps.mirror(f) for f in left_frames])]:
    folder=A/'frames'/name;folder.mkdir(parents=True,exist_ok=True);entries=[];preview=[]
    for i,f in enumerate(frames):
        rel=f'frames/{name}/{i:03}.png';f.save(A/rel)
        entries.append({'file':rel,'durationMs':60,'eyes':[]})
        bg=Image.new('RGBA',(w,h),'#f2f4e8');bg.alpha_composite(f);preview.append(bg.convert('RGB'))
    manifest['animations'][name]={'frames':entries,'fps':16.6666667,'loop':True}
    preview[0].save(QA/(name+'.gif'),save_all=True,append_images=preview[1:],duration=60,loop=0)
sheet=Image.new('RGB',(192*8,224*2),'#f2f4e8')
for i,f in enumerate(left_frames):
    small=f.resize((192,224),Image.Resampling.LANCZOS);sheet.paste(small,((i%8)*192,(i//8)*224),small)
sheet.save(QA/'standing-run-contact.png')
manifest['animations']['glance']['frames']=[f for f in manifest['animations']['glance']['frames'] if int(Path(f['file']).stem)>=24]
preview=[]
for entry in manifest['animations']['glance']['frames']:
    im=Image.open(A/entry['file']).convert('RGBA');bg=Image.new('RGBA',(w,h),'#f2f4e8');bg.alpha_composite(im);preview.append(bg.convert('RGB'))
preview[0].save(QA/'glance.gif',save_all=True,append_images=preview[1:],duration=[f['durationMs'] for f in manifest['animations']['glance']['frames']],loop=0)
(A/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(QA/'standing-run.json').write_text(json.dumps({'idle_source':'final.gif frame 0','run_source':'same high-resolution standing sprite','method':'original-pixel two-segment leg articulation, subtle torso bounce','frames_per_direction':16,'duration_ms_per_frame':60,'uses_old_run_gif':False},indent=2),encoding='utf8')
print('Standing idle and run updated')
