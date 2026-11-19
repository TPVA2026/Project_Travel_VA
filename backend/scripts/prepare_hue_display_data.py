"""Integrate TPVA-67 display assets without changing cost/routing evidence."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'backend/app/data/Hue'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    descriptions = {p['placeId']: p for p in read(ROOT / 'docs/tpva-67-visual-descriptions.json')['places']}
    public = []
    for filename, folder in [('attractions.json', 'attractions.HUE'), ('restaurants.json', 'restaurants.HUE')]:
        manifest_path = ROOT / 'frontend/public/images' / folder / 'sources.json'
        manifests = {e['placeId']: e for e in read(manifest_path)['images']}
        places = read(DATA / filename)
        for place in places:
            pid = place['id']
            if pid not in descriptions:
                continue
            text = descriptions[pid]
            manifest = manifests[pid]
            file_sources = {s['file']: s for s in manifest.get('fileSources', [])}
            images = []
            for image_file in manifest['files']:
                source = file_sources.get(image_file, manifest)
                image = dict(url=f'/images/{folder}/{image_file}', alt=place['name'],
                             sourceUrl=source.get('sourceUrl'), sourceType=source.get('sourceType'),
                             credit=source.get('credit'), authorName=source.get('authorName'),
                             license=source.get('license'),
                             verificationStatus=source.get('verificationStatus', 'user_reported'))
                assert (ROOT / 'frontend/public' / image['url'].lstrip('/')).is_file()
                images.append(image)
            place['description'] = text['description']
            place['descriptionProvenance'] = text['provenance']
            place['descriptionReviewStatus'] = text['reviewStatus']
            place['images'] = images
            public.append(dict(id=pid, name=place['name'], description=place['description'],
                               descriptionReviewStatus=place['descriptionReviewStatus'],
                               images=images, placeUrl=manifest.get('placeUrl') or place.get('googlemapid')))
        write(DATA / filename, places)
    booking = {p['placeId']: p for p in read(ROOT / 'docs/tpva-67-booking-links.json')['properties']}
    hotel_manifest_path = ROOT / 'frontend/public/images/accomodation.HUE/sources.json'
    hotel_assets = {}
    if hotel_manifest_path.is_file():
        hotel_assets = {pid: e for e in read(hotel_manifest_path)['images'] for pid in e['placeIds']}
    hotels = read(DATA / 'accomodation.json')
    for hotel in hotels:
        record = booking[hotel['id']]
        hotel['bookingComReference'] = {
            'url': record['bookingCandidateUrl'], 'identityStatus': record['identityStatus'],
            'sourceType': record['evidenceType'], 'checkedOn': record['searchedOn'],
            'note': record['note'], 'liveAvailabilityVerified': False,
            'quote': None,
        }
        asset = hotel_assets.get(hotel['id'])
        if asset:
            hotel['images'] = [dict(url=f'/images/accomodation.HUE/{s["file"]}',
                                    **{k: v for k, v in s.items() if k != 'file'}) for s in asset['fileSources']]
            hotel['description'] = asset['description']
            hotel['descriptionProvenance'] = asset['descriptionProvenance']
            hotel['descriptionReviewStatus'] = asset['descriptionReviewStatus']
            for image in hotel['images']:
                assert (ROOT / 'frontend/public' / image['url'].lstrip('/')).is_file()
        hotel.setdefault('images', [])
        hotel.setdefault('description', None)
        public.append(dict(id=hotel['id'], name=hotel['name'], description=hotel['description'],
                           images=hotel['images'], bookingComReference=hotel['bookingComReference']))
    write(DATA / 'accomodation.json', hotels)
    write(ROOT / 'frontend/public/hue-place-display.json', {'destinationId': 'H', 'places': public})
    missing_image_sources = [dict(placeId=p['id'], image=i['url']) for p in public for i in p['images']
                             if not i.get('sourceUrl') and i.get('sourceType') != 'user_original_photo']
    readiness = dict(status='INCOMPLETE', attractionsWithImages=10, restaurantsWithImages=10,
                     hotelRecords=len(hotels), hotelProperties=len({h['name'] for h in hotels}),
                     hotelRecordsMissingImages=[h['id'] for h in hotels if not h['images']],
                     hotelRecordsMissingDescriptions=[h['id'] for h in hotels if not h['description']],
                     missingImageSources=missing_image_sources,
                     bookingIdentityNeedsReview=[r for r in booking.values() if r['identityStatus'] not in ('name_and_street_address_match', 'user_confirmed_identity')],
                     note='Dated quotes remain unknown. Candidate links are not verified identity or availability. Images/descriptions supplied for 20 curated places; hotel assets and unresolved property identities remain outstanding.')
    write(ROOT / 'docs/tpva-67-readiness.json', readiness)
    print(f'Integrated 20 places and {len(hotels)} hotel references. Missing image sources: {len(missing_image_sources)}. Hotel images absent: {len(readiness["hotelRecordsMissingImages"])} records.')


if __name__ == '__main__':
    main()
