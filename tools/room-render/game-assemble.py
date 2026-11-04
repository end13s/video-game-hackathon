# Turns the renders in out/ into the assets the TV uses. Usage: python3 game-assemble.py <repo>/public/room
import glob, os, sys, shutil
from PIL import Image
dest = sys.argv[1]; os.makedirs(dest + '/people', exist_ok=True)
Image.open('out/game-room.png').convert('RGB').save(dest + '/room.jpg', quality=87, optimize=True, progressive=True)
PX = 30  # px per rem at scale 1.5
for name in ('lectern', 'chair'):
    im = Image.open(f'out/game-{name}.png').convert('RGBA'); a = im.getchannel('A').point(lambda v: 255 if v > 200 else 0); box = a.getbbox()
    im.crop(box).save(f'{dest}/{name}.png', optimize=True)
    print(name, 'w', round((box[2] - box[0]) / PX, 2), 'h', round((box[3] - box[1]) / PX, 2), 'bottom', round((im.height - box[3]) / PX, 2), 'cx', round((box[0] + box[2]) / 2 / PX, 2))
for f in glob.glob('out/fig-*.png'):
    n = os.path.basename(f)[4:]
    if n in ('sheet.png', 'front-gold.png'): continue
    Image.open(f).save(f'{dest}/people/{n}', optimize=True)
