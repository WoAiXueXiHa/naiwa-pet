"""Fit the complete laugh sequence to the bundled MP3 (3996.688 ms).
Run after process_final.py to reapply this playback preference.
"""
from pathlib import Path
import json,sys
from PIL import Image
root=Path(__file__).resolve().parents[1];assets=root/'assets'
manifest=json.loads((assets/'manifest.json').read_text(encoding='utf8'))
frames=manifest['animations']['laugh']['frames']
target=float(sys.argv[1]) if len(sys.argv)>1 else 3996.688
total=sum(f['durationMs'] for f in frames)
for f in frames:f['durationMs']=f['durationMs']*target/total
frames[-1]['durationMs']=target-sum(f['durationMs'] for f in frames[:-1])
(assets/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
qa=root.parent/'动作预览';previews=[]
for f in frames:
    im=Image.open(assets/f['file']).convert('RGBA');bg=Image.new('RGBA',im.size,'#f2f4e8');bg.alpha_composite(im);previews.append(bg.convert('RGB'))
# GIF time precision is 10 ms; the app uses the exact fractional durations.
elapsed=0;previous=0;durations=[]
for f in frames:
    elapsed+=f['durationMs'];end=round(elapsed/10)*10;durations.append(max(10,end-previous));previous=end
previews[0].save(qa/'laugh.gif',save_all=True,append_images=previews[1:],duration=durations,loop=0)
(qa/'laugh-timing.json').write_text(json.dumps({'duration_ms':target,'frames':len(frames),'audio_loop':False,'preserves_complete_sequence':True},indent=2),encoding='utf8')
print('Laugh duration:',sum(f['durationMs'] for f in frames),'ms')
