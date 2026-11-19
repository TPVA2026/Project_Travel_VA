"""Normalize uploaded hotel assets and save visually grounded descriptions."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'frontend/public/images'
DIRECTORY = BASE / 'accomodation.HUE'
GROUPS = [
    ('ACCOM_H_01', ['ACCOM_H_01'], 'mag',
     'Ảnh phòng cho thấy giường đôi, nội thất gỗ và nền gạch hoa văn xanh trắng, với cửa mở ra ban công. Khu ngồi riêng có ghế sofa; phòng tắm dùng vách kính và mảng tường xanh làm điểm nhấn.',
     ['Phòng giường đôi với cửa ra ban công và gạch hoa văn', 'Khu ghế sofa với kệ gỗ và tivi', 'Phòng tắm có vách kính và gạch tông xanh']),
    ('ACCOM_H_05', ['ACCOM_H_05'], 'deluxe',
     'Không gian bếp và bàn ăn trong ảnh dùng tông trắng kết hợp tủ tối màu. Sân hiên có cây xanh, bàn ghế ngoài trời; phòng ngủ có giường đôi, cửa kính lớn và góc phòng tắm có vách kính.',
     ['Bếp và bàn ăn với nội thất sáng màu', 'Sân hiên có bàn ghế và cây xanh', 'Phòng giường đôi cạnh cửa kính lớn']),
    ('ACCOM_H_06', ['ACCOM_H_06'], 'sanfoka',
     'Ảnh ghi lại hồ bơi ngoài trời rộng được bao quanh bởi cây dừa và ghế nằm. Phòng dùng nhiều gỗ ở sàn, tường và trần; lối đi ven sông có cây xanh tạo cảm giác gần gũi thiên nhiên.',
     ['Hồ bơi ngoài trời với hàng dừa và ghế nằm', 'Phòng hai giường với sàn tường trần gỗ', 'Lối đi ven sông có hàng dừa và cây cảnh']),
    ('HOTEL_H_EMM', ['HOTEL_H_EMM_DELUXE', 'HOTEL_H_EMM_FAMILY'], 'êm',
     'Ảnh cho thấy hồ bơi ngoài trời được bao quanh bởi cây xanh và ghế nằm. Không gian nhà hàng và sảnh dùng tông sáng điểm màu tím, với cửa kính lớn và nhiều chỗ ngồi.',
     ['Hồ bơi ngoài trời với cây xanh và ghế nằm', 'Không gian nhà hàng với bàn ăn và cửa kính lớn', 'Khu vực sảnh với ghế ngồi tông tím']),
    ('HOTEL_H_ROSALEEN_SUPERIOR', ['HOTEL_H_ROSALEEN_SUPERIOR'], 'rosaleen',
     'Phòng trong ảnh dùng tông màu kem và gỗ, với giường đôi, rèm lớn và bàn trang điểm. Các ảnh khác ghi lại quầy đồ ăn và hồ bơi ngoài trời có ghế nằm, ô che nắng.',
     ['Phòng ngủ với giường đôi và cửa sổ', 'Quầy trưng bày các món ăn', 'Hồ bơi ngoài trời với ghế nằm và ô che nắng']),
    ('ACCOM_H_02', ['ACCOM_H_02'], 'bailey',
     'Bộ ảnh cho thấy hồ bơi dạng dài trong không gian có mái che và cửa kính. Nội thất phòng có tông sáng, chi tiết vàng và đỏ; một ảnh khác thể hiện khu bàn ăn nhỏ cạnh cửa kính.',
     ['Hồ bơi dài trong không gian có mái che', 'Khu bàn ăn nhỏ cạnh cửa kính', 'Phòng với hai giường và điểm nhấn màu đỏ']),
    ('ACCOM_H_03', ['ACCOM_H_03'], 'lumiere',
     'Phòng trong ảnh kết hợp sàn và nội thất gỗ với mảng đầu giường màu cam hoặc khung cửa vòm cao. Không gian ăn uống có bàn ghế gỗ, quầy bar và những ô cửa nhìn ra cây xanh.',
     ['Phòng với đầu giường màu cam và khu ghế ngồi', 'Phòng hai giường với khung cửa vòm cao', 'Không gian ăn uống với bàn ghế gỗ và quầy bar']),
    ('ACCOM_H_04', ['ACCOM_H_04'], 'century',
     'Phòng trong ảnh có hai giường, sàn gỗ và cửa sổ lớn nhìn về phía mặt nước. Một ảnh ghi lại bàn ăn đặt trên khoảng hiên thoáng, với hàng dừa và sông ở phía trước.',
     ['Phòng hai giường với cửa sổ lớn', 'Bàn ăn ngoài hiên hướng ra sông', 'Góc ngồi và bàn làm việc cạnh cửa sổ']),
    ('ACCOM_H_07', ['ACCOM_H_07'], 'lavela',
     'Ảnh phòng cho thấy hai giường, đầu giường bọc đệm và cửa kính lớn mở tầm nhìn ra thành phố. Các ảnh nhà hàng thể hiện quầy buffet cùng không gian bàn ăn tông tối với điểm nhấn màu xanh.',
     ['Phòng hai giường với cửa kính nhìn ra thành phố', 'Quầy buffet với các khay có nắp', 'Không gian nhà hàng tông tối với điểm nhấn màu xanh']),
    ('ACCOM_H_08', ['ACCOM_H_08'], 'indochine',
     'Phòng có nội thất gỗ, tông vàng kem và giường đôi đặt trong không gian rộng với bàn ghế riêng. Khu nhà hàng trong ảnh dùng ghế gỗ, đèn trang trí và vách ngăn hoa văn, kèm quầy trưng bày nhiều món ăn.',
     ['Phòng giường đôi với nội thất gỗ và khu ghế ngồi', 'Bàn ăn trong nhà hàng có vách ngăn trang trí', 'Quầy trưng bày món ăn trong nhà hàng']),
    ('ACCOM_H_09', ['ACCOM_H_09'], 'vin',
     'Bộ ảnh nổi bật với hồ bơi có mái che, cửa kính lớn và ghế nằm hướng ra thành phố lúc hoàng hôn. Các phòng dùng nội thất hiện đại, thảm hoa văn và những mảng màu xanh, tím hoặc cam làm điểm nhấn.',
     ['Hồ bơi có mái che và ghế nằm nhìn ra thành phố', 'Phòng giường đôi với thảm hoa văn màu xanh', 'Phòng hai giường với điểm nhấn màu cam']),
    ('ACCOM_H_10', ['ACCOM_H_10'], 'azera',
     'Khu nhà sáng màu có mặt đứng uốn cong, ban công và hành lang nhìn ra khu vườn nhiều cây xanh. Ảnh phòng ghi lại giường đôi, nội thất gỗ sẫm và cửa kính ra ban công; ảnh toàn cảnh buổi tối cho thấy mặt sông phía sau khu nhà.',
     ['Hồ bơi ngoài trời cạnh khu vườn và nhà sáng màu', 'Phòng giường đôi với nội thất gỗ và cửa ra ban công', 'Toàn cảnh khu nhà lên đèn cạnh mặt sông lúc hoàng hôn']),
]


def main():
    hotels = json.loads((ROOT / 'backend/app/data/Hue/accomodation.json').read_text(encoding='utf-8'))
    indexed = {h['id']: h for h in hotels}
    path = DIRECTORY / 'sources.json'
    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'images': []}
    existing = {e['propertyId']: e for e in previous['images']}
    moves = []
    for property_id, ids, prefix, description, captions in GROUPS:
        for index, suffix in enumerate(('', '1', '2'), 1):
            old = f'{prefix}{suffix}.jpg'
            candidates = [DIRECTORY / old, BASE / old]
            sources = [p for p in candidates if p.is_file()]
            target = DIRECTORY / f'{property_id}_{index:02d}.jpg'
            if len(sources) > 1 or (sources and target.exists()):
                raise ValueError(f'Ambiguous source or existing target: {old}')
            if sources:
                source = sources[0]
                assert source.resolve().is_relative_to(BASE.resolve())
                assert target.resolve().is_relative_to(DIRECTORY.resolve())
                moves.append((source, target))
            elif not target.is_file():
                raise ValueError(f'Missing image: {old}')
    for source, target in moves:
        source.rename(target)
    entries = []
    for property_id, ids, prefix, description, captions in GROUPS:
        entry = existing.get(property_id, {})
        file_sources = {s['file']: s for s in entry.get('fileSources', [])}
        files = [f'{property_id}_{i:02d}.jpg' for i in range(1, 4)]
        entry.update(propertyId=property_id, placeIds=ids, placeName=indexed[ids[0]]['name'],
                     files=files, description=description, descriptionReviewStatus='draft_visual_description',
                     descriptionProvenance={'method': 'visual_observation_of_user_supplied_images',
                                            'images': [f'/images/accomodation.HUE/{f}' for f in files]},
                     bookingComReference=indexed[ids[0]].get('bookingComReference'),
                     note='Tên cơ sở ánh xạ theo tên file người dùng. Ảnh mô tả cơ sở, chưa xác nhận loại phòng hoặc tiện ích có sẵn theo ngày. Link Booking là tham chiếu cơ sở, không tự coi là nguồn ảnh.')
        entry['fileSources'] = [dict(file_sources.get(f, dict(file=f, sourceType='unknown', sourceUrl=None,
                                                              authorName=None, license=None, credit=None,
                                                              verificationStatus='missing_source')),
                                     alt=f"{entry['placeName']} — {caption}", caption=caption,
                                     roomType=None) for f, caption in zip(files, captions)]
        entries.append(entry)
    order = {h['id']: i for i, h in enumerate(hotels)}
    entries.sort(key=lambda e: min(order[pid] for pid in e['placeIds']))
    path.write_text(json.dumps({'images': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    actual = {p.name for p in DIRECTORY.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}}
    referenced = [f for e in entries for f in e['files']]
    assert len(referenced) == len(set(referenced)) == len(actual) == len(GROUPS) * 3
    assert set(referenced) == actual
    lines = ['# TPVA-67 — Ảnh và mô tả cơ sở lưu trú Huế', '',
             f'{len(referenced)} ảnh cho {len(entries)} cơ sở. ÊMM có hai bản ghi loại phòng dùng chung ảnh cơ sở. Mô tả dựa trên quan sát ảnh; tên cơ sở ánh xạ theo tên file. Chưa có nguồn ảnh do người dùng cung cấp; không tự gán link Booking thành nguồn ảnh.', '',
             '| Cơ sở | IDs | Số ảnh | Mô tả |', '| --- | --- | --- | --- |']
    for e in entries:
        lines.append(f"| {e['placeName']} | {', '.join(e['placeIds'])} | {len(e['files'])} | {e['description']} |")
    covered = {pid for e in entries for pid in e['placeIds']}
    lines += ['', '## Còn thiếu ảnh', '']
    lines += [f"- {h['id']}: {h['name']}" for h in hotels if h['id'] not in covered]
    (ROOT / 'docs/tpva-67-hotels-images.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Normalized {len(moves)} hotel images; {len(GROUPS)} properties have 3 images each; {len({h["name"] for h in hotels if h["id"] not in covered})} properties still missing images.')


if __name__ == '__main__':
    main()
