"""Normalize user-named Hue restaurant uploads and create image provenance."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'frontend/public/images/restaurants.HUE'
MAPPING = {
    'REST_H_01': ['quanbanhole.jpg', 'quanbanholeee.jpg'],
    'REST_H_02': ['banhuot1.jpg', 'anhuot2.jpg'],
    'REST_H_03': ['bungiamnuoc.jpg', 'bungiamnuoc1.jpg'],
    'REST_H_04': ['hoadong.jpg', 'hoadong1.jpg'],
    'REST_H_05': ['bunbo1.jpg', 'bunbo2.jpg'],
    'REST_H_06': ['com.jpg', 'comchan.jpg'],
    'REST_H_07': ['banhmi.jpg', 'banhmi1.jpg'],
    'REST_H_08': ['vitthuan1.jpg'],
    'REST_H_09': ['checam.jpg'],
    'REST_H_10': ['thuybanhcanh.jpg'],
}
SOURCE_URLS = {
    'REST_H_01': 'https://www.foody.vn/hue/banh-beo-o-le',
    'REST_H_02': 'https://www.bachhoaxanh.com/kinh-nghiem-hay/quan-banh-uot-cuon-thit-nuong-3-the-he-noi-tieng-dong-khach-o-hue-1548402',
    'REST_H_03': 'https://khamphahue.com.vn/Du-lich/Chi-tiet/tid/Bun-Giam-Nuoc-chan-cau-Gia-Hoi.html/pid/3957/cid/383',
    'REST_H_04': 'https://www.foody.vn/hue/quan-hoa-dong',
    'REST_H_05': 'https://mia.vn/cam-nang-du-lich/quan-me-keo-kham-pha-quan-bun-bo-hue-70-nam-luon-dong-nghet-khach-o-vung-dat-co-do-2322',
    'REST_H_06': 'https://hue.gov.vn/Du-khach/Thong-tin-du-khach/Thong-tin-can-biet/tb/Chan-Nha-hang-com-nieu-mon-Hue-287595',
    'REST_H_07': 'https://hues.vn/dia-diem/tiem-banh-mi-truong-tien-o-tho/',
    'REST_H_08': 'https://hue.gov.vn/Du-khach/Thong-tin-du-khach/Thong-tin-can-biet/tb/Vit-Thuan-Huong-vi-dan-da-trong-am-thuc-Hue-570907',
    'REST_H_09': 'https://huetripo.hue.gov.vn/co-so-an-uong/quan-an/che-cam-742890',
    'REST_H_10': 'https://lh3.googleusercontent.com/gps-cs-s/ANWiy9QT5JpJbQ5e9rWL2UgSxPr-3h8BOpJ78SUJoXqur3WAjEN0P_Er2uVeMSC6edE2-DJS6HM3lM13QA45ib6DXcPYViUf2bScU3FuQTSrkBxLCwmRDJaugjB2nPms7me0LOHdepa1W6FuNegy=s1360-w1360-h1020-rw',
}


def main():
    places = json.loads((ROOT / 'backend/app/data/Hue/restaurants.json').read_text(encoding='utf-8'))
    places = {p['id']: p for p in places if p['id'].startswith('REST_H_')}
    manifest_path = DIRECTORY / 'sources.json'
    previous = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'images': []}
    entries = {e['placeId']: e for e in previous['images']}
    pending = []
    for pid, originals in MAPPING.items():
        for index, original in enumerate(originals, 1):
            source = DIRECTORY / original
            target = DIRECTORY / f'{pid}_{index:02d}{source.suffix}'
            if source.exists():
                if target.exists():
                    raise ValueError(f'Target exists: {target.name}')
                pending.append((source, target))
            elif not target.exists():
                raise ValueError(f'Missing image: {original}')
    for source, target in pending:
        source.rename(target)
    for pid, originals in MAPPING.items():
        place = places[pid]
        entry = entries.setdefault(pid, dict(placeId=pid, sourceType='unknown', sourceUrl=None,
                                            credit=None, authorName=None, license=None))
        entry.update(placeName=place['name'],
                     files=[f'{pid}_{i:02d}{Path(original).suffix}' for i, original in enumerate(originals, 1)])
        entry['originalFiles'] = dict(zip(entry['files'], originals))
        entry.update(sourceType='user_supplied_web_sources', sourceUrl=SOURCE_URLS[pid])
        entry['fileSources'] = [
            dict(file=f, sourceType='web', sourceUrl=SOURCE_URLS[pid], authorName=None, license=None,
                 sourceKind='direct_image' if pid == 'REST_H_10' else 'web_page',
                 verificationStatus='user_reported') for f in entry['files']]
        entry['note'] = 'Nguồn do người dùng cung cấp trong hội thoại, áp dụng cho nhóm ảnh của quán; chưa đối chiếu độc lập từng ảnh hoặc giấy phép.'
        if pid == 'REST_H_10':
            entry['note'] += ' Link Googleusercontent là ảnh trực tiếp, chưa có trang nguồn và tên tác giả.'
        # URLs of page sources must be supplied explicitly; never infer image sources.
    result = {'images': [entries[pid] for pid in sorted(places)]}
    manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    referenced = [f for e in result['images'] for f in e['files']]
    actual = {p.name for p in DIRECTORY.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}}
    assert len(referenced) == len(set(referenced)) == len(actual)
    assert set(referenced) == actual
    assert len(result['images']) == 10
    assert all((DIRECTORY / f).exists() for f in referenced)
    lines = ['# TPVA-67 — Ảnh restaurants Huế', '',
             '| ID | Quán | Số ảnh | Nguồn ảnh |', '| --- | --- | --- | --- |']
    for entry in result['images']:
        count = sum(bool(s.get('sourceUrl')) or s.get('sourceType') == 'user_original_photo' for s in entry['fileSources'])
        lines.append(f"| {entry['placeId']} | {entry['placeName']} | {len(entry['files'])} | {count}/{len(entry['files'])} có nguồn |")
    lines += ['', 'Đã ghi link nguồn người dùng cung cấp cho đủ 17 ảnh. Link của quán Thúy là ảnh trực tiếp, còn thiếu trang nguồn/tác giả. Chưa xác minh độc lập ảnh, chi nhánh hoặc giấy phép.', '',
              'Dữ liệu được đồng bộ vào backend và JSON hiển thị bằng backend/scripts/prepare_hue_display_data.py.', '']
    (ROOT / 'docs/tpva-67-restaurants-images.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'Renamed {len(pending)} images; validated {len(actual)} files across 10/10 restaurants.')


if __name__ == '__main__':
    main()
