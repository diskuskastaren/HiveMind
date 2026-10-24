"""Generate HiveMind's geometric program icon and platform assets."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = 2048
SCALE = SIZE / 1024

def xy(points):
    return [(round(x * SCALE), round(y * SCALE)) for x, y in points]

image = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.polygon(xy([(512, 112), (822, 291), (822, 649), (512, 828), (202, 649), (202, 291)]), fill='#4f46e5')
for left, right, top in [(350, 674, 322), (395, 629, 457), (435, 589, 592)]:
    draw.rounded_rectangle(
        (round(left*SCALE), round(top*SCALE), round(right*SCALE), round((top+74)*SCALE)),
        radius=round(37*SCALE), fill='#ffffff'
    )

main = image.resize((512, 512), Image.Resampling.LANCZOS)
main.save(ROOT / 'electron' / 'icon.png')
main.save(ROOT / 'public' / 'icon.png')
image.save(ROOT / 'electron' / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

(ROOT / 'public' / 'icon.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <path fill="#4f46e5" d="M512 112 822 291v358L512 828 202 649V291z"/>
  <g fill="#fff">
    <rect x="350" y="322" width="324" height="74" rx="37"/>
    <rect x="395" y="457" width="234" height="74" rx="37"/>
    <rect x="435" y="592" width="154" height="74" rx="37"/>
  </g>
</svg>\n''', encoding='utf-8')
