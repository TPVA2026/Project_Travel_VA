"""Save Booking.com search findings without fabricating dated quotes."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FINDINGS = {
    'HOTEL_H_EMM_DELUXE': ('festival-hue.da.html', 'name_match_address_review_required', ''),
    'HOTEL_H_EMM_FAMILY': ('festival-hue.da.html', 'name_match_address_review_required', ''),
    'HOTEL_H_ROSALEEN_SUPERIOR': ('new-star.html', 'name_match_address_review_required', ''),
    'ACCOM_H_01': ('magnolia-boutique-hue.vi.html', 'user_confirmed_identity', 'Người dùng xác nhận đúng cơ sở Magnolia tại số 10 Trần Hữu Dực, Huế. Giữ khác biệt địa chỉ hiển thị trên Booking (2 Hoàng Văn Thụ 22) làm ghi chú nguồn; không coi là địa chỉ thay thế đã xác minh.'),
    'ACCOM_H_02': ('bailey-hue.pt-br.html', 'name_match_address_review_required', ''),
    'ACCOM_H_03': ('lumiere-boutique-vy-da.fr.html', 'name_match_address_review_required', ''),
    'ACCOM_H_04': ('century-riverside-hue.id.html', 'name_match_address_review_required', ''),
    'ACCOM_H_05': ('deluxe-villa-thanh-pho-hue.vi.html', 'name_and_street_address_match', 'Booking ghi 20 Lý Tự Trọng, Huế, khớp địa chỉ dataset. Không suy ra số phòng ngủ/giường do thông tin listing chưa thống nhất.'),
    'ACCOM_H_06': ('sankofa-village-hill-resort-spa.html', 'name_and_street_address_match', 'Booking ghi 8 Ngoc Ho, Huong Ho, Huong Tra, Hue; khớp số nhà và đường Ngọc Hồ với dataset. Không tự thay tên đơn vị hành chính cũ/mới.'),
    'ACCOM_H_07': ('la-vela-hue.vi.html', 'name_match_address_review_required', ''),
    'ACCOM_H_08': ('indochine-palace.fr.html', 'name_match_address_review_required', ''),
    'ACCOM_H_09': ('melia-vinpearl-hue-hotel.en-gb.html', 'name_and_street_address_match', 'Booking: 50A Hùng Vương, khớp số nhà/đường dataset.'),
    'ACCOM_H_10': ('azerai-la-residence-hue.vi.html', 'name_match_address_review_required', ''),
}


def main():
    hotels = json.loads((ROOT / 'backend/app/data/Hue/accomodation.json').read_text(encoding='utf-8'))
    for hotel in hotels:
        if hotel['id'] == 'ACCOM_H_01':
            if 'addressProvenance' not in hotel:
                hotel['addressProvenance'] = dict(previousValue=hotel.get('address'),
                                                 sourceType='user_confirmation',
                                                 note='Địa chỉ do người dùng xác nhận trong hội thoại.')
            hotel['address'] = '10 Trần Hữu Dực, Huế'
    (ROOT / 'backend/app/data/Hue/accomodation.json').write_text(json.dumps(hotels, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    records = []
    for hotel in hotels:
        slug, status, note = FINDINGS[hotel['id']]
        records.append(dict(placeId=hotel['id'], name=hotel['name'], datasetAddress=hotel.get('address'),
                            bookingCandidateUrl='https://www.booking.com/hotel/vn/' + slug if slug else None,
                            identityStatus=status, note=note, searchedOn='2026-11-19',
                            evidenceType='web_search_index', liveAvailabilityVerified=False,
                            priceVnd=None, checkIn=None, checkOut=None, adults=None, childrenAges=None,
                            rooms=None))
    for record in records:
        if record['placeId'] == 'ACCOM_H_01':
            record['evidenceType'] = 'web_search_and_user_confirmation'
    content = dict(note='Link ứng viên từ tìm kiếm web; một số trang yêu cầu JavaScript. Chưa xác nhận giá hoặc phòng trống theo ngày. Không thay bookingUrl canonical đang có.', properties=records)
    (ROOT / 'docs/tpva-67-booking-links.json').write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    path = ROOT / 'docs/tpva-67-hotels-checklist.csv'
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        columns = list(reader.fieldnames)
        rows = list(reader)
    for col in ('Link Booking.com ứng viên', 'Trạng thái đối chiếu', 'Ghi chú đối chiếu'):
        if col not in columns:
            columns.append(col)
    for row in rows:
        record = next(r for r in records if r['name'] == row['Tên cơ sở'])
        row['Link Booking.com ứng viên'] = record['bookingCandidateUrl'] or ''
        row['Trạng thái đối chiếu'] = record['identityStatus']
        row['Ghi chú đối chiếu'] = record['note']
        row['Địa chỉ theo dataset'] = record['datasetAddress'] or ''
    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    assert len(records) == 13 and len({r['name'] for r in records}) == 12
    assert all(r['priceVnd'] is None and not r['liveAvailabilityVerified'] for r in records)
    print('Saved candidate links and identity notes for 12 properties; no dated price or availability asserted.')


if __name__ == '__main__':
    main()
