from datetime import datetime, timezone, timedelta
import json
import sqlite3
import httpx
import pytest
from defusedxml.common import DefusedXmlException
from app import external

NOW=datetime(2026,10,30,tzinfo=timezone.utc)
RSS=b'''<rss><channel>
<item><title>Artemis lunar update</title><description>&lt;p&gt;Moon mission &amp;amp; science.&lt;/p&gt;</description><link>https://www.nasa.gov/story/lunar-update/</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Earth research</title><description>Ocean science</description><link>https://www.nasa.gov/earth/</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Moon malicious URL</title><link>javascript:alert(1)</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Moon external URL</title><link>https://nasa.gov.attacker.invalid/</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Lunar future</title><link>https://www.nasa.gov/future/</link><pubDate>Thu, 29 Oct 2036 12:00:00 GMT</pubDate></item>
<item><title>Moon undated</title><link>https://www.nasa.gov/undated/</link></item>
</channel></rss>'''

def test_rss_filters_dates_links_and_plain_text():
    articles=external.parse_feed(RSS,'NASA',NOW)
    assert len(articles)==1
    assert articles[0]['title']=='Artemis lunar update'
    assert '<p>' not in articles[0]['summary']
    assert articles[0]['published_at']=='2026-10-29T12:00:00+00:00'

@pytest.mark.parametrize('data',[b'<html><p>not RSS</p></html>',b'no XML',b'x'*(external.MAX_BYTES+1)])
def test_invalid_or_oversized_feeds(data):
    with pytest.raises((ValueError, external.ElementTree.ParseError)):
        external.parse_feed(data,'NASA',NOW)

def test_xml_entities_rejected():
    with pytest.raises(DefusedXmlException):
        external.parse_feed(b'<!DOCTYPE rss [<!ENTITY bad "expansion">]><rss><channel><item><title>&bad;</title></item></channel></rss>','NASA',NOW)

def test_cache_deduplicates_and_bounds_requests(tmp_path,monkeypatch):
    calls=[]
    def fetch(url): calls.append(url);return RSS
    monkeypatch.setattr(external,'fetch',fetch)
    # Published dates in the static fixture are valid relative to the test's runtime.
    first=external.news(tmp_path/'cache.sqlite');second=external.news(tmp_path/'cache.sqlite')
    assert first['status']=='live'
    assert len(first['articles'])==1
    assert second['cached'] is True
    assert len(calls)==2

def test_failure_is_explicit_and_stale_data_is_labeled(tmp_path,monkeypatch):
    path=tmp_path/'cache.sqlite'
    monkeypatch.setattr(external,'fetch',lambda _:RSS)
    first=external.news(path)
    with sqlite3.connect(path) as db:
        row=json.loads(db.execute('SELECT value FROM public_feeds').fetchone()[0]);row['retry_at']=0
        db.execute('UPDATE public_feeds SET value=?',(json.dumps(row),))
    def fail(_): raise httpx.ConnectError('blocked')
    monkeypatch.setattr(external,'fetch',fail)
    stale=external.news(path)
    assert stale['status']=='stale'
    assert stale['fetched_at']==first['fetched_at']
    unavailable=external.news(tmp_path/'fresh.sqlite')
    assert unavailable['status']=='unavailable'
    assert unavailable['articles']==[]
    assert unavailable['fetched_at'] is None

def test_out_of_range_forecast_never_requests_data(tmp_path,monkeypatch):
    def fail(_): pytest.fail('No request should be attempted for out-of-range dates')
    monkeypatch.setattr(external,'fetch',fail)
    for day in [datetime.now(timezone.utc).date()-timedelta(days=1), datetime.now(timezone.utc).date()+timedelta(days=16)]:
        data=external.weather(tmp_path/'weather.sqlite','kennedy',day)
        assert data['status']=='out_of_range' and data['hours']==[]

def test_real_format_weather_response_and_nulls(tmp_path,monkeypatch):
    date=datetime.now(timezone.utc).date()
    payload={'hourly':{'time':[str(date)+'T00:00'],'temperature_2m':[21.5],'precipitation_probability':[None],'wind_speed_10m':[10],'cloud_cover':[50]},'hourly_units':{'temperature_2m':'°C','precipitation_probability':'%','wind_speed_10m':'km/h','cloud_cover':'%'}}
    monkeypatch.setattr(external,'fetch',lambda _:json.dumps(payload).encode())
    data=external.weather(tmp_path/'weather.sqlite','kennedy',date)
    assert data['status']=='live'
    assert data['hours'][0]['temperature_2m']==21.5
    assert data['hours'][0]['precipitation_probability'] is None
    payload['hourly_units']['wind_speed_10m']='mph'
    assert external.weather(tmp_path/'bad.sqlite','kennedy',date)['status']=='unavailable'
    for i,malformed in enumerate([[], {'hourly':None}, {'hourly':{'time':[None]}}, {'hourly':{'time':['bad-time']}}]):
        monkeypatch.setattr(external,'fetch',lambda _, value=malformed: json.dumps(value).encode())
        assert external.weather(tmp_path/f'malformed-{i}.sqlite','kennedy',date)['status']=='unavailable'


def test_feed_api_validation(client,monkeypatch):
    monkeypatch.setattr(external,'fetch',lambda _:RSS)
    assert len(client.get('/api/launch-pads').json())==2
    assert client.get('/api/weather?pad=unknown&date=2026-10-30').status_code==422
    assert client.get('/api/weather?pad=kennedy&date=invalid').status_code==422
    assert client.get('/api/news').status_code==200
