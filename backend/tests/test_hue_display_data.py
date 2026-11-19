"""Verify TPVA-67 assets survive data/context loading without false evidence."""
import json
from pathlib import Path

from app.services.ai.context_builder import build_context
from app.services.data_service import load_dataset

ROOT = Path(__file__).resolve().parents[2]


def test_curated_display_assets_resolve_and_reach_llm_context():
    dataset = load_dataset(destination='H')
    context = build_context({'preferences': {'destination': 'H'}}, dataset, limit_places=False)
    places = [p for key in ('attractions', 'dining') for p in context[key]
              if p['id'].startswith(('ATTR_H_', 'REST_H_'))]
    assert len(places) == 20
    for place in places:
        assert place['description']
        assert place['descriptionReviewStatus'] == 'draft_visual_description'
        assert place['images']
        for image in place['images']:
            assert image['url'].startswith('/images/')
            assert (ROOT / 'frontend/public' / image['url'].lstrip('/')).is_file()
            assert image['verificationStatus'] != 'VERIFIED'


def test_frontend_manifest_matches_loaded_places_and_preserves_booking_uncertainty():
    display = json.loads((ROOT / 'frontend/public/hue-place-display.json').read_text(encoding='utf-8'))
    dataset = load_dataset(destination='H')
    loaded = {p['id']: p for key in ('attractions', 'dining', 'hotels') for p in dataset[key]}
    assert len(display['places']) == 33
    assert len({p['id'] for p in display['places']}) == 33
    for place in display['places']:
        assert place['images'] == loaded[place['id']]['images']
    hotels = {p['id']: p for p in dataset['hotels']}
    for hotel in hotels.values():
        reference = hotel['bookingComReference']
        assert reference['quote'] is None
        assert reference['liveAvailabilityVerified'] is False
        for image in hotel['images']:
            assert (ROOT / 'frontend/public' / image['url'].lstrip('/')).is_file()
            assert image['roomType'] is None
    assert sum(bool(h['images']) for h in hotels.values()) == 13
    assert hotels['HOTEL_H_EMM_DELUXE']['images'] == hotels['HOTEL_H_EMM_FAMILY']['images']
    assert hotels['ACCOM_H_01']['bookingComReference']['identityStatus'] == 'user_confirmed_identity'
    assert hotels['ACCOM_H_01']['address'] == '10 Trần Hữu Dực, Huế'
    assert len({h['name'] for h in hotels.values()}) == 12
    assert sorted(h['id'] for h in hotels.values() if h['id'].startswith('ACCOM_H_')) == [f'ACCOM_H_{i:02d}' for i in range(1, 11)]
    assert hotels['ACCOM_H_06']['bookingComReference']['url'].endswith('/sankofa-village-hill-resort-spa.html')
