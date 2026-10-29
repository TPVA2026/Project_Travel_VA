from app.services.data_service import load_dataset


def test_dataset_has_expected_keys():
    assert set(load_dataset()) == {"destinations", "attractions", "dining", "travel_matrix"}


# TODO(Thư Anh): test dataset content (null prices stay null, ids unique)
