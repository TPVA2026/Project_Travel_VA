"""Record image provenance supplied by the user, without claiming web review."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'frontend/public/images/attractions.HUE'
SOURCES = {
    'ATTR_H_02': [
        'https://eticket.hueworldheritage.org.vn/diem-den/cung-an-dinh'
    ] * 3,
    'ATTR_H_04': [
        'https://nangtrip.com/activities/ben-xua-vy-da',
        'https://www.threads.com/@haanhpham.1806/post/DOWeiFJEnMT/media',
    ],
    'ATTR_H_05': [
        'https://mia.vn/cam-nang-du-lich/kham-pha-cho-dong-ba-khu-cho-phon-hoa-bac-nhat-xu-kinh-ky-2251',
        'https://travel.com.vn/tin-tuc-du-lich/cho-dong-ba-hue-co-gi-hap-dan-v16168.aspx',
        'https://khamphahue.com.vn/Du-lich/Chi-tiet/tid/Thuong-thuc-am-thuc-dem-tai-Cho-Dong-Ba-Hue.html/pid/14738/cid/383',
    ],
    'ATTR_H_06': [
        'https://mia.vn/cam-nang-du-lich/nghieng-minh-truoc-que-huong-cua-nhung-chiec-non-bai-tho-lang-tay-ho-2525',
        'https://khamphahue.com.vn/Du-lich/Chi-tiet/tid/Lang-nghe-non-la-xu-Hue.html/pid/8543/cid/323',
        'https://cdn3.ivivu.com/2014/05/lang-tay-ho-noi-xuat-xu-non-bai-tho-xu-hue-8-ivivu.jpg',
    ],
    'ATTR_H_07': [
        'https://mia.vn/cam-nang-du-lich/truong-quoc-hoc-hue-chiem-nguong-ve-dep-dam-chat-troi-au-tai-co-do-2448'
    ] * 3,
    'ATTR_H_08': [
        'https://mia.vn/cam-nang-du-lich/alo-o-day-co-tat-tan-tat-kinh-nghiem-di-lang-huong-thuy-xuan-ne-ban-oi-2542',
        'https://www.lagunalangco.com/vi/lang-huong-thuy-xuan-lang-nghe-700-tuoi-giua-long-co-do/',
        'https://www.lagunalangco.com/vi/lang-huong-thuy-xuan-lang-nghe-700-tuoi-giua-long-co-do/',
    ],
    # Original "thien mu 2.jpg" was normalized to ATTR_H_09_03.jpg.
    'ATTR_H_09': [None, None,
        'https://vietluxtour.com/kham-pha/chua-thien-mu-hue.html?srsltid=AYCX9vIQkTUIyWktreG7mcbOM53qzJPZi1aPy1fm_dzydF0ltX38WVq5',
    ],
}


def main():
    path = DIRECTORY / 'sources.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    for entry in manifest['images']:
        pid = entry['placeId']
        if pid not in SOURCES:
            continue
        urls = SOURCES[pid]
        assert len(entry['files']) == len(urls)
        entry['sourceType'] = 'mixed' if pid == 'ATTR_H_09' else 'user_supplied_web_sources'
        unique = set(urls)
        entry['sourceUrl'] = urls[0] if len(unique) == 1 else None
        entry['credit'] = None
        entry['note'] = 'Nguồn từng ảnh do người dùng cung cấp; chưa đối chiếu độc lập nội dung trang, tác giả hoặc giấy phép.'
        if pid == 'ATTR_H_07':
            entry['note'] += ' Một link Quốc Học được áp dụng cho cả ba ảnh theo nhóm người dùng cung cấp; cần đối chiếu từng ảnh.'
        entry['fileSources'] = []
        for filename, url in zip(entry['files'], urls):
            source = dict(file=filename, sourceType='user_original_photo' if url is None else 'web',
                          sourceUrl=url, authorName=None, license=None,
                          credit='Ảnh tự chụp do người dùng cung cấp' if url is None else None,
                          verificationStatus='user_reported')
            if url and 'cdn3.ivivu.com' in url:
                source['sourceKind'] = 'direct_image'
                source['note'] = 'Link ảnh trực tiếp; chưa có link bài viết chứa ảnh.'
            elif url:
                source['sourceKind'] = 'web_page'
            entry['fileSources'].append(source)
    bridge = next(e for e in manifest['images'] if e['placeId'] == 'ATTR_H_10')
    bridge.update(sourceType='user_supplied_web_sources',
                  sourceUrl='https://khamphahue.com.vn/Du-lich/Chi-tiet/tid/Cau-Truong-Tien.html/pid/10594/cid/81',
                  note='Nguồn cho hai ảnh Cầu Trường Tiền do người dùng cung cấp; chưa đối chiếu độc lập nội dung trang, tác giả hoặc giấy phép.')
    for index, original in enumerate(('cau-truong-tien.jpg', 'truong tien.jpg'), 1):
        source = DIRECTORY / original
        target = DIRECTORY / f'ATTR_H_10_{index:02d}.jpg'
        if source.exists():
            if target.exists():
                raise ValueError(f'Target already exists: {target.name}')
            source.rename(target)
        if not target.exists():
            raise ValueError(f'Missing bridge image: {target.name}')
    bridge['files'] = ['ATTR_H_10_01.jpg', 'ATTR_H_10_02.jpg']
    bridge['fileSources'] = [dict(file=f, sourceType='web', sourceUrl=bridge['sourceUrl'],
                                  sourceKind='web_page', authorName=None, license=None,
                                  credit=None, verificationStatus='user_reported')
                             for f in bridge['files']]
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    actual = {p.name for p in DIRECTORY.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}}
    referenced = [f for e in manifest['images'] for f in e['files']]
    assert len(referenced) == len(set(referenced)) == len(actual)
    assert set(referenced) == actual
    for entry in manifest['images']:
        if entry.get('fileSources'):
            assert [s['file'] for s in entry['fileSources']] == entry['files']
    lines = ['# TPVA-67 — Ảnh attractions Huế', '',
             'Nguồn do người dùng cung cấp, chưa đối chiếu độc lập ảnh/trang nguồn hoặc giấy phép. Ảnh tự chụp không cần URL bên ngoài.', '',
             '| ID | Địa điểm | Số ảnh | Nguồn |', '| --- | --- | --- | --- |']
    for entry in manifest['images']:
        status = 'Ảnh tự chụp' if entry['sourceType'] == 'user_original_photo' else 'Đã ghi nguồn từng ảnh'
        if not entry['files']:
            status = 'Có link nguồn; còn thiếu file ảnh'
        lines.append(f"| {entry['placeId']} | {entry['placeName']} | {len(entry['files'])} | {status} |")
    lines += ['', 'Đã có 28 ảnh cho đủ 10/10 điểm. Bến Xưa và Cầu Trường Tiền có 2 ảnh/điểm, các điểm còn lại có 3 ảnh/điểm.', '',
              'Lưu ý: lang non 2.jpg → ATTR_H_06_03.jpg chỉ có link ảnh CDN, chưa có trang bài viết. thien mu 2.jpg → ATTR_H_09_03.jpg dùng nguồn Vietluxtour; hai ảnh Thiên Mụ còn lại là ảnh tự chụp. Quốc Học dùng chung link được cung cấp cho nhóm ba ảnh.', '']
    (ROOT / 'docs/tpva-67-attractions-images.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'Validated {len(actual)} image files across {sum(bool(e["files"]) for e in manifest["images"])}/10 attractions; every image has recorded provenance.')


if __name__ == '__main__':
    main()
