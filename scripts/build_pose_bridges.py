"""Actual pose bridges. Excludes the first THREE rejected laugh-relax poses.
Usage: python scripts/build_pose_bridges.py <start-strip> <turn-strip> <relax-strip>
Optional build dependencies: Pillow, numpy, scipy. Existing core frames stay intact.
"""
from pathlib import Path
import sys,json
import numpy as np
from scipy import ndimage
from PIL import Image,ImageOps,ImageFilter
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'assets';QA=ROOT.parent/'动作预览'
manifest=json.loads((A/'manifest.json').read_text(encoding='utf8'))
def core(action,i=0):return Image.open(A/manifest['animations'][action]['frames'][i]['file']).convert('RGBA')
def strip(path,indices):
    src=Image.open(path).convert('RGBA');cw=src.width//6;pieces=[]
    for i in indices:
        im=src.crop((i*cw,0,(i+1)*cw,src.height));a=np.array(im)
        labels,n=ndimage.label(a[:,:,3]>35);sizes=np.bincount(labels.ravel());sizes[0]=0
        keep=labels==int(sizes.argmax());a[:,:,3][~keep]=0
        im=Image.fromarray(a);pieces.append(im.crop(im.getbbox()))
    scale=min(352/max(p.width for p in pieces),405/max(p.height for p in pieces))
    out=[]
    for p in pieces:
        p=p.resize((round(p.width*scale),round(p.height*scale)),Image.Resampling.LANCZOS)
        stage=Image.new('RGBA',(384,448));stage.alpha_composite(p,((384-p.width)//2,435-p.height));out.append(stage)
    return out
sources=A/'motion-sources'
if len(sys.argv)>=4:
    start=strip(sys.argv[1],range(6));turn=strip(sys.argv[2],range(6));relax=strip(sys.argv[3],[3,4,5])
    for name,poses in [('start',start),('turn',turn),('relax-accepted',relax)]:
        (sources/name).mkdir(parents=True,exist_ok=True)
        for i,p in enumerate(poses):p.save(sources/name/f'{i:02}.png')
else:
    load=lambda name:[Image.open(p).convert('RGBA') for p in sorted((sources/name).glob('*.png'))]
    start,turn,relax=load('start'),load('turn'),load('relax-accepted')
(sources/'run-left').mkdir(parents=True,exist_ok=True)
for i in range(8):
    dest=sources/'run-left'/f'{i:02}.png'
    if not dest.exists():core('run-left',i).save(dest)
for name,mirror in [('run-left',False),('run-right',True)]:
    entries=[]
    for i in range(8):
        p=Image.open(sources/'run-left'/f'{i:02}.png').convert('RGBA')
        if mirror:p=ImageOps.mirror(p)
        rel=f'frames/{name}/{i:03}.png';p.save(A/rel);entries.append({'file':rel,'durationMs':90,'eyes':[]})
    manifest['animations'][name]={'frames':entries,'fps':1000/90,'loop':True}
idle=core('idle');run=core('run-left');lastLaugh=len(manifest['animations']['laugh']['frames'])-1
bridges={};preview={}
def save(key,poses,ms):
    folder='pose-bridges/'+key.replace(':','_').replace('>','--');(A/folder).mkdir(parents=True,exist_ok=True)
    entries=[]
    for i,p in enumerate(poses):
        rel=f'{folder}/{i:03}.png';p.save(A/rel);entries.append({'file':rel,'durationMs':ms/len(poses),'eyes':[]})
    bridges[key]={'frames':entries,'fps':1000*len(poses)/ms,'loop':False};preview[key]=[(p,ms/len(poses)) for p in poses]
enter=start[1:]+[run]
exitRun=list(reversed(start[1:]))+[idle]
turnIdle=turn[1:5]+[ImageOps.mirror(idle)]
save('idle:0>run-left',enter,240)
save('run-left:0>idle',exitRun,240)
save('idle:0>turn',turnIdle,200)
save('run-left:0>turn',exitRun+turnIdle+[ImageOps.mirror(p) for p in enter],520)
# First three relax frames were rejected by the user and are never saved or used.
save(f'laugh:{lastLaugh}>idle',relax+[idle],220)
save('idle:0>laugh',list(reversed(relax))+[core('laugh')],180)
prefix=[Image.open(A/f'frames/glance/{i:03}.png').convert('RGBA') for i in [0,6,12,18,24]]
save('idle:0>glance',prefix[1:],100)
glance=manifest['animations']['glance']['frames'];last=len(glance)-1
for i in sorted(set(list(range(0,last+1,5))+[last])):
    poses=[core('glance',j) for j in range(i,-1,-1)]+list(reversed(prefix[:-1]))+[idle]
    save(f'glance:{i}>idle',poses,140+180*i/max(1,last))
manifest['bridges']=bridges
(A/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
def gif(name,sequence):
    images=[];durations=[];elapsed=0;prior=0
    for p,ms in sequence:
        bg=Image.new('RGBA',p.size,'#f2f4e8');bg.alpha_composite(p)
        images.append(bg.convert('RGB').resize((192,224),Image.Resampling.LANCZOS))
        elapsed+=ms;end=round(elapsed/10)*10;durations.append(max(10,end-prior));prior=end
    images[0].save(QA/name,save_all=True,append_images=images[1:],duration=durations,loop=0)
seq=[(idle,500)]+preview['idle:0>run-left']
seq += [(core('run-left',i),90) for _ in range(2) for i in range(8)]
# Complete the current stride before settling back into the exact idle pose.
seq += [(run,90)]+preview['run-left:0>idle']+[(idle,600)]
gif('自然衔接-起跑与停步.gif',seq)
for action in ['laugh','glance']:
    entries=manifest['animations'][action]['frames'];last=len(entries)-1
    seq=[(idle,500)]+preview[f'idle:0>{action}']+[(core(action,i),f['durationMs']) for i,f in enumerate(entries)]
    seq+=preview[f'{action}:{last}>idle']+[(idle,500)]
    gif('自然衔接-'+action+'.gif',seq)
gif('自然衔接-转身.gif',[(idle,500)]+preview['idle:0>turn']+[(ImageOps.mirror(idle),500)]+[(ImageOps.mirror(p),ms) for p,ms in preview['idle:0>turn']]+[(idle,500)])
# A contact sheet contains only accepted return-to-idle poses.
contact=Image.new('RGB',(192*4,224),'#f2f4e8')
for i,p in enumerate(relax+[idle]):
    p=p.resize((192,224),Image.Resampling.LANCZOS);contact.paste(p,(i*192,0),p)
contact.save(QA/'收尾过渡-已去除三帧.png')
(QA/'motion-bridges.json').write_text(json.dumps({'bridges':len(bridges),'method':'actual generated intermediate poses + original GIF retracing','rejected_relax_indices':[0,1,2],'no_crossfade_or_optical_flow':True,'run_stop_gate':0},indent=2),encoding='utf8')
print('Accepted pose bridges complete:',len(bridges),flush=True)
