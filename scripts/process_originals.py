"""Preserve the user's RGB pixels; estimate only alpha, then register each source as a family.
Requires: pillow, rembg, onnxruntime, numpy, scipy. Model cache via U2NET_HOME.
Run from project directory. No generative redraw is used in this pipeline.
"""
import json,os,sys
from pathlib import Path
from PIL import Image,ImageFilter,ImageOps,ImageDraw
import numpy as np
from scipy import ndimage
from rembg import new_session,remove

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'
QA=ROOT.parent/'动作预览'
QA.mkdir(exist_ok=True)
WIDTH,HEIGHT=384,448
session=new_session(os.environ.get('NAIWA_MATTING_MODEL','u2netp'),providers=['CPUExecutionProvider'])
run_only='--run-only' in sys.argv
report=json.loads((QA/'source-processing.json').read_text(encoding='utf8')) if run_only else {'method':'original RGB + U2Net foreground alpha','sources':{},'generated_character_art_used':False}

def cutout(im):
    original=im.convert('RGBA')
    alpha=remove(original,session=session,only_mask=True)
    mask=np.array(alpha)>105
    labels,count=ndimage.label(mask)
    if not count:raise ValueError('No foreground detected')
    sizes=np.bincount(labels.ravel());sizes[0]=0
    mask=labels==int(sizes.argmax())
    mask=ndimage.binary_fill_holes(mask)
    # Only the alpha is changed; retain original RGB even on low-quality GIFs.
    alpha=Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45))
    original.putalpha(alpha)
    return original

def register(frames):
    boxes=[im.getbbox() for im in frames]
    left=min(b[0] for b in boxes);top=min(b[1] for b in boxes)
    right=max(b[2] for b in boxes);bottom=max(b[3] for b in boxes)
    scale=min(352/(right-left),408/(bottom-top))
    result=[]
    for im in frames:
        crop=im.crop((left,top,right,bottom))
        crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
        target=Image.new('RGBA',(WIDTH,HEIGHT))
        target.alpha_composite(crop,((WIDTH-crop.width)//2,HEIGHT-12-crop.height))
        result.append(target)
    return result,{'source_union':[left,top,right,bottom],'shared_scale':scale}

def eyes_for(im):
    a=np.array(im)
    # Small muted-green irises; constrain search to the head area.
    r,g,b=a[:,:,0].astype(float),a[:,:,1].astype(float),a[:,:,2].astype(float)
    mask=(g>r*1.06)&(g>b*1.03)&(g>40)&(a[:,:,3]>100)
    mask[int(HEIGHT*.38):]=False
    labels,n=ndimage.label(mask)
    found=[]
    for label in range(1,n+1):
        yy,xx=np.where(labels==label)
        if len(xx)<6:continue
        found.append((len(xx),[(max(0,int(xx.min())-5))/WIDTH,(max(0,int(yy.min())-5))/HEIGHT,(min(WIDTH,int(xx.max())+6))/WIDTH,(min(HEIGHT,int(yy.max())+6))/HEIGHT]))
    found.sort(reverse=True)
    return [x[1] for x in found[:2]]

def save_family(name,frames,durations,loop):
    out=ASSETS/'frames'/name;out.mkdir(parents=True,exist_ok=True)
    result=[]
    for i,im in enumerate(frames):
        rel=f'frames/{name}/{i:03}.png';im.save(ASSETS/rel)
        result.append({'file':rel,'durationMs':durations[i],'eyes':eyes_for(im)})
    return {'frames':result,'fps':12,'loop':loop}

manifest=json.loads((ASSETS/'manifest.json').read_text(encoding='utf8')) if run_only else {'width':WIDTH,'height':HEIGHT,'animations':{}}
idle_src=Image.open(ASSETS/'references'/'idle-original.png')
idle_raw=cutout(idle_src)
ia=np.array(idle_raw);rgb=ia[:,:,:3].astype(int)
ground=np.max(rgb,axis=2)-np.min(rgb,axis=2)<32
ground[:170]=False;ia[:,:,3][ground]=0
idle_raw=Image.fromarray(ia)
idle,info=register([idle_raw]);idle[0].save(ASSETS/'base.png');idle[0].resize((64,74),Image.Resampling.LANCZOS).save(ASSETS/'tray.png')
manifest['animations']['idle']=save_family('idle',idle,[1000],True)
report['sources']['idle']={**info,'frames':1,'original_size':list(idle_src.size)}

for name,source,loop in [('laugh','laugh.gif',False),('run-right','run.gif',True)]:
    if run_only and name!='run-right':continue
    gif=Image.open(ASSETS/'references'/source);frames=[];durations=[]
    for i in range(gif.n_frames):
        gif.seek(i);durations.append(gif.info.get('duration',80));frames.append(cutout(gif.convert('RGBA')))
        if i%10==0:print(name,i,'/',gif.n_frames,flush=True)
    frames,info=register(frames)
    manifest['animations'][name]=save_family(name,frames,durations,loop)
    report['sources'][name]={**info,'frames':len(frames),'duration_ms':sum(durations),'original_size':list(gif.size)}
    if name=='run-right':
        manifest['animations']['run-left']=save_family('run-left',[ImageOps.mirror(f) for f in frames],durations,True)
    # GIF preview uses a light background; final sprite frames remain transparent.
    preview=[]
    for f in frames:
        bg=Image.new('RGBA',f.size,'#f2f4e8');bg.alpha_composite(f);preview.append(bg.convert('RGB'))
    preview[0].save(QA/(name+'.gif'),save_all=True,append_images=preview[1:],duration=durations,loop=0)
    count=min(12,len(frames));sheet=Image.new('RGB',(192*6,224*2),'#f2f4e8')
    for j in range(count):
        idx=round(j*(len(frames)-1)/(count-1));f=frames[idx].resize((192,224),Image.Resampling.LANCZOS)
        sheet.paste(f,((j%6)*192,(j//6)*224),f)
    sheet.save(QA/(name+'-contact.png'))

# The rest prompt is visual only; the user requested a static idle pose.
manifest['animations']['stretch']={'frames':manifest['animations']['idle']['frames'],'fps':1,'loop':False}
# Glance is supplied by a separate pixel-preserving compositing step.
manifest['animations'].setdefault('glance',{'frames':manifest['animations']['idle']['frames'],'fps':1,'loop':False})
(ASSETS/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(QA/'source-processing.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
idle[0].save(QA/'idle.png')
print('Original-source extraction complete',flush=True)
