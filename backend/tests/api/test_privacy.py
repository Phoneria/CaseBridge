import pytest
from app.api.deps import get_current_user
from app.main import app
from app.privacy import ner


@pytest.fixture
def bureau_user(client, two_firms_two_users, monkeypatch):
    user = two_firms_two_users['user_a']
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(ner, '_pipe', None)
    monkeypatch.setattr(ner, '_get', lambda: pytest.fail('must not load/download a model'))
    return user


def test_anonymous_denied(client):
    assert client.post('/privacy/anonymize', json={'text': 'sentetik'}).status_code == 401


def test_masking_stateless_redacted(client, bureau_user, db_session):
    response = client.post('/privacy/anonymize', json={'text': 'Davalı Mehmet YILMAZ, mehmet@example.test, 0532 123 45 67 Ankara.'})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    body = response.json()
    assert set(body) == {'text', 'counts', 'report', 'ner_available', 'review_required'}
    assert 'mehmet@example.test' not in response.text
    assert '0532 123 45 67' not in response.text
    assert body['ner_available'] is False and body['review_required'] is True
    assert 'Ankara' in body['text']
    assert not db_session.new and not db_session.dirty
    # No mapping/state carries into a subsequent request.
    second = client.post('/privacy/anonymize', json={'text': 'ayse@example.test'}).json()
    assert second['text'] == '[E-POSTA-1]'


@pytest.mark.parametrize('payload', [{'text': ''}, {'text': ' '}, {'text': 123}, {'text': 'x'*30001}, {'text': 'private@example.test', 'law_firm_id': 'other'}, ['private@example.test']])
def test_invalid_input_not_reflected(client, bureau_user, payload):
    response = client.post('/privacy/anonymize', json=payload)
    assert response.status_code == 422
    assert 'private@example.test' not in response.text and 'input' not in response.json()


def test_platform_denied(client, bureau_user):
    bureau_user.is_platform_admin = True
    assert client.post('/privacy/anonymize', json={'text': 'sentetik'}).status_code == 403


def test_restricted_denied_with_real_session(client, office, auth_headers, db_session):
    from app.models.management import WorkspaceAccess
    headers = auth_headers(office.lawyer_a1)
    db_session.add(WorkspaceAccess(user_id=office.lawyer_a1.id, law_firm_id=office.firm_a.id, position="client"))
    db_session.commit()
    assert client.post('/privacy/anonymize', headers=headers, json={'text': 'sentetik'}).status_code == 403


@pytest.mark.parametrize('name', ['admin_a', 'lawyer_a1', 'admin_b', 'lawyer_b'])
def test_bureau_roles_and_firms(client, office, auth_headers, name, monkeypatch):
    monkeypatch.setattr(ner, '_pipe', None)
    response = client.post('/privacy/anonymize', headers=auth_headers(getattr(office, name)), json={'text': 'sentetik@example.test'})
    assert response.status_code == 200
    assert response.json()['text'] == '[E-POSTA-1]'
