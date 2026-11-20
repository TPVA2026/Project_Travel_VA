"""Normalize uploaded Hue image filenames and audit their source manifest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'frontend/public/images/attractions.HUE'
GROUPS = {
    'ATTR_H_02': ['an dinh.png', 'an dinh 1.png', 'an dinh 2.png'],
    'ATTR_H_04': ['ben xua.jpeg', 'ben xua 1.jpg'],
    'ATTR_H_05': ['dong ba.jpg', 'dong ba 1.jpg', 'dong ba 2.jpg'],
    'ATTR_H_06': ['lang non.jpg', 'lang non 1.png', 'lang non 2.jpg'],
    'ATTR_H_07': ['quoc hoc hue.jpg', 'quoc hoc hue 1.jpg', 'quoc hoc hue 2.jpg'],
    'ATTR_H_08': ['lang huong.jpeg', 'lang huong 1.jpg', 'lang huong 2.jpg'],
    'ATTR_H_09': ['thien mu.jpg', 'thien mu 1.jpg', 'thien mu 2.jpg'],
}
MAPS = {
    'ATTR_H_01': 'https://maps.app.goo.gl/LoJRg49Sxx9JhV2i9',
    'ATTR_H_03': 'https://maps.app.goo.gl/4CmYruGYt4LMAnMU9',
    'ATTR_H_05': 'https://maps.app.goo.gl/sWjDPqcFDs5ttHiy9',
    'ATTR_H_08': 'https://maps.app.goo.gl/aG7DpyQf9atYK3t97',
}


def main():
    manifest_path = DIRECTORY / 'sources.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    places = json.loads((ROOT / 'backend/app/data/Hue/attractions.json').read_text(encoding='utf-8'))
    places = [p for p in places if p['id'].startswith('ATTR_H_')]
    existing = {entry['placeId']: entry for entry in manifest['images']}
    renames = []
    for pid, filenames in GROUPS.items():
        for index, original in enumerate(filenames, 1):
            source = DIRECTORY / original
            target = DIRECTORY / f'{pid}_{index:02d}{source.suffix.lower()}'
            if source.exists():
                if target.exists():
                    raise ValueError(f'Target already exists: {target.name}')
                renames.append((source, target))
            elif not target.exists():
                raise ValueError(f'Missing original and normalized image: {original}')
    for source, target in renames:
        source.rename(target)
        for entry in manifest['images']:
            entry['files'] = [target.name if f == source.name else f for f in entry.get('files', [])]
    entries = []
    report = ['# TPVA-67 — Hue attraction image inventory', '',
              'Coverage is based on canonical ATTR_H IDs and actual uploaded files. Image content and reuse rights have not been independently reviewed.', '',
              '| ID | Name | Image count | Source status |', '| --- | --- | --- | --- |']
    for place in places:
        pid = place['id']
        files = sorted(p.name for p in DIRECTORY.glob(f'{pid}_*') if p.is_file() and p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'})
        entry = existing.get(pid, dict(placeId=pid, sourceType='unknown', credit=None,
                                     sourceUrl=None, authorName=None, license=None,
                                     note='Chưa cung cấp nguồn ảnh; không suy ra nguồn từ tên file hoặc link địa điểm.'))
        entry['files'] = files
        entry['placeName'] = place['name']
        if pid in MAPS:
            entry['placeUrl'] = MAPS[pid]
            entry['placeUrlNote'] = 'Link địa điểm do người dùng cung cấp, không phải nguồn ảnh.'
        entries.append(entry)
        status = 'User confirmed original photos' if entry['sourceType'] == 'user_original_photo' else 'Missing image source'
        if not files:
            status = 'Missing images and source'
        report.append(f"| {pid} | {place['name']} | {len(files)} | {status} |")
    manifest['images'] = entries
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'docs/tpva-67-attractions-images.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    referenced = [f for e in entries for f in e['files']]
    actual = {p.name for p in DIRECTORY.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}}
    assert len(referenced) == len(set(referenced))
    assert set(referenced) == actual
    assert len(entries) == len({e['placeId'] for e in entries}) == 10
    print(f'Renamed {len(renames)} images. Validated {len(actual)} files across {sum(bool(e["files"]) for e in entries)}/10 attractions.')
    print('Missing images: ' + ', '.join(e['placeId'] for e in entries if not e['files']))


if __name__ == '__main__':
    main()
