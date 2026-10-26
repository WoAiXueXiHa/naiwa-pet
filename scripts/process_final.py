"""Extract the final user GIF, preserving source pixels and exact frame times.
Repair recorder UI at the feet using clean feet from the SAME GIF (not redraw).
Requires the same optional Python dependencies as process_originals.py.
"""
import json,os
from pathlib import Path
from PIL import Image,ImageFilter
import numpy as np
from scipy import ndimage
from rembg import new_session,remove

ROOT=Path(__file__).resolve().parents[1];A=ROOT/'assets';QA=ROOT.parent/'动作预览'
cache=Path(os.environ.get('NAIWA_FRAME_CACHE',str(ROOT.parent.parent/'work'/'final-cutouts')))
cache.mkdir(parents=True,exist_ok=True)
session=new_session('u2net',providers=['CPUExecutionProvider'])
gif=Image.open(A/'references'/'final.gif')
raw=[];durations=[]
for i in range(gif.n_frames):
    gif.seek(i);raw.append(gif.convert('RGBA'));durations.append(gif.info.get('duration',80))

def repaired(index):
    im=raw[index].copy()
    anchor=None
    if 13<=index<=64:anchor=0 if index<=53 else 65
    elif 76<=index<=109:anchor=75 if index<93 else 110
    if anchor is not None:
        # Player's cyan bar starts at y=1058. The planted feet are static here.
        clean=raw[anchor].crop((0,1040,im.width,im.height))
        im.paste(clean,(0,1040))
    return im

boxes=[]
for i in range(len(raw)):
    dest=cache/f'{i:03}.png'
    if not dest.exists():
        im=repaired(i);mask=np.array(remove(im,session=session,only_mask=True))>110
        labels,n=ndimage.label(mask);sizes=np.bincount(labels.ravel());sizes[0]=0
        mask=ndimage.binary_fill_holes(labels==int(sizes.argmax()))
        alpha=Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.5))
        im.putalpha(alpha);im.save(dest)
    with Image.open(dest) as im:boxes.append(im.getbbox())
    if i%15==0:print('final',i,'/',len(raw),flush=True)

left=min(b[0] for b in boxes);top=min(b[1] for b in boxes);right=max(b[2] for b in boxes);bottom=max(b[3] for b in boxes)
scale=min(352/(right-left),408/(bottom-top));cw,ch=round((right-left)*scale),round((bottom-top)*scale)
frames=[]
for i in range(len(raw)):
    im=Image.open(cache/f'{i:03}.png').crop((left,top,right,bottom)).resize((cw,ch),Image.Resampling.LANCZOS)
    stage=Image.new('RGBA',(384,448));stage.alpha_composite(im,((384-cw)//2,448-12-ch));frames.append(stage)

def eye_regions(im):
    a=np.array(im);r,g,b=a[:,:,0].astype(float),a[:,:,1].astype(float),a[:,:,2].astype(float)
    mask=(g>r*1.03)&(g>b*1.02)&(g>45)&(a[:,:,3]>120);mask[180:]=False
    labels,n=ndimage.label(mask);out=[]
    for i in range(1,n+1):
        yy,xx=np.where(labels==i)
        if len(xx)>8:out.append((len(xx),[(xx.min()-5)/384,(yy.min()-5)/448,(xx.max()+6)/384,(yy.max()+6)/448]))
    return [list(map(float,v)) for _,v in sorted(out,reverse=True)[:2]]

manifest=json.loads((A/'manifest.json').read_text(encoding='utf8'))
for name,start,end in [('glance',0,54),('laugh',54,166)]:
    folder=A/'frames'/name;folder.mkdir(parents=True,exist_ok=True);entries=[];preview=[]
    for idx in range(start,end):
        f=frames[idx];rel=f'frames/{name}/{idx-start:03}.png';f.save(A/rel)
        entries.append({'file':rel,'durationMs':durations[idx],'eyes':eye_regions(f)})
        bg=Image.new('RGBA',f.size,'#f2f4e8');bg.alpha_composite(f);preview.append(bg.convert('RGB'))
    manifest['animations'][name]={'frames':entries,'fps':12,'loop':False}
    preview[0].save(QA/(name+'.gif'),save_all=True,append_images=preview[1:],duration=durations[start:end],loop=0)
    sheet=Image.new('RGB',(192*6,224*2),'#f2f4e8')
    for j in range(12):
        idx=start+round(j*(end-start-1)/11);f=frames[idx].resize((192,224),Image.Resampling.LANCZOS)
        sheet.paste(f,((j%6)*192,(j//6)*224),f)
    sheet.save(QA/(name+'-contact.png'))
(A/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(QA/'final-source-processing.json').write_text(json.dumps({
    'source':'references/final.gif','size':list(gif.size),'source_frames':len(raw),
    'glance':{'frames':[0,53],'duration_ms':sum(durations[:54])},
    'laugh':{'frames':[54,165],'duration_ms':sum(durations[54:])},
    'recorder_ui_repaired_frames':[[13,64],[76,109]],'repair':'same-GIF clean feet rows y>=1040; not generative redraw',
    'source_union':[left,top,right,bottom],'shared_scale':scale
},ensure_ascii=False,indent=2),encoding='utf8')
print('Final source extraction complete',flush=True)
