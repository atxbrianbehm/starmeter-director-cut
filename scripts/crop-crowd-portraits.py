from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
sheet_dir = root / "public" / "assets" / "crowd-sheets"
out_dir = root / "public" / "assets" / "crowd-portraits"
out_dir.mkdir(parents=True, exist_ok=True)

for sheet_index, sheet_path in enumerate(sorted(sheet_dir.glob("sheet-*.png")), start=1):
    image = Image.open(sheet_path).convert("RGB")
    width, height = image.size
    if sheet_path.stem == "sheet-01":
        # The first sheet has generous black gutters around each portrait panel.
        x_edges = [210, 662, 1110, 1457]
        y_edges = [32, 462, 480, 912]
        row_bounds = [(y_edges[0], y_edges[1]), (y_edges[2], y_edges[3])]
    else:
        x_edges = [round(width * index / 3) for index in range(4)]
        y_edges = [round(height * index / 2) for index in range(3)]
        row_bounds = [(y_edges[0], y_edges[1]), (y_edges[1], y_edges[2])]
    for row in range(2):
        for col in range(3):
            left, right = x_edges[col], x_edges[col + 1]
            top, bottom = row_bounds[row]
            cell_width = right - left
            cell_height = bottom - top
            crop_width = min(cell_width, round(cell_height * 2 / 3))
            crop_left = left + (cell_width - crop_width) // 2
            crop = image.crop((crop_left, top, crop_left + crop_width, bottom))
            crop.save(out_dir / f"crowd-{(sheet_index - 1) * 6 + row * 3 + col + 1:02d}.jpg", quality=92, optimize=True)

print(f"wrote {len(list(out_dir.glob('crowd-*.jpg')))} portraits")
