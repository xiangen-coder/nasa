"""Bounded, cached public information feeds. No generated headlines or forecasts."""
import json
import re
import sqlite3
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from threading import RLock
from urllib.parse import urlparse
import httpx
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

LOCK = RLock()
NEWS_SOURCES = [
    ('NASA', 'https://www.nasa.gov/feed/'),
    ('NASA Artemis blog', 'https://blogs.nasa.gov/artemis/feed/'),
]
PADS = [
    {'id': 'kennedy', 'name': 'Kennedy Space Center area', 'latitude': 28.5729, 'longitude': -80.6490, 'source': 'https://www.nasa.gov/kennedy/'},
    {'id': 'vandenberg', 'name': 'Vandenberg Space Force Base area', 'latitude': 34.7420, 'longitude': -120.5724, 'source': 'https://www.vandenberg.spaceforce.mil/'},
]
LUNAR = re.compile(r'\b(moon|lunar|artemis|gateway|clps)\b', re.I)
MAX_BYTES = 2 * 1024 * 1024

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.hidden=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def plain(value):
    parser=Text(); parser.feed(value or '')
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()

def fetch(url):
    # Sources are fixed server-side. Never accept a user-supplied fetch URL.
    with httpx.Client(timeout=httpx.Timeout(8, connect=4), follow_redirects=False) as client:
        with client.stream('GET',url,headers={'User-Agent':'LunarNavigator/1.1 (public RSS/forecast reader)'}) as response:
            response.raise_for_status()
            data=bytearray()
            for chunk in response.iter_bytes():
                data.extend(chunk)
                if len(data)>MAX_BYTES: raise ValueError('Feed exceeded size limit')
            return bytes(data)

def parse_feed(data, source, now):
    if len(data)>MAX_BYTES: raise ValueError('Feed exceeded size limit')
    root=ElementTree.fromstring(data)
    if root.tag != "rss" or root.find("channel") is None: raise ValueError("Expected an RSS channel")
    articles=[]
    for item in root.findall('.//item')[:150]:
        title=plain(item.findtext('title'))[:240]
        summary=plain(item.findtext('description'))[:1000]
        link=(item.findtext('link') or '').strip()
        parsed=urlparse(link)
        host=(parsed.hostname or '').lower()
        if parsed.scheme!='https' or not (host=='nasa.gov' or host.endswith('.nasa.gov')) or parsed.username or parsed.password:
            continue
        if not title or not LUNAR.search(title+' '+summary): continue
        try:
            date=parsedate_to_datetime(item.findtext('pubDate') or '')
            if date.tzinfo is None: continue
            date=date.astimezone(timezone.utc)
            if date>now+timedelta(days=1): continue
        except (ValueError, TypeError, OverflowError): continue
        articles.append({'title':title,'summary':summary,'url':link,'published_at':date.isoformat(),'source':source})
    return articles

def cached(path, key, ttl, producer, empty=None):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with LOCK, sqlite3.connect(path,timeout=30) as db:
        db.execute('CREATE TABLE IF NOT EXISTS public_feeds (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        row=db.execute('SELECT value FROM public_feeds WHERE key=?',(key,)).fetchone()
        old=json.loads(row[0]) if row else None
        now=datetime.now(timezone.utc)
        if old and now.timestamp()<old['retry_at']:
            return old['payload'] | {'cached':True}
        try:
            payload=producer(now)
            # Partial news responses retain a shorter retry window.
            delay=300 if payload.get('warnings') else ttl
            record={'payload':payload,'retry_at':now.timestamp()+delay}
        except (httpx.HTTPError, ValueError, ElementTree.ParseError, DefusedXmlException):
            if old and old['payload'].get('fetched_at') and now-datetime.fromisoformat(old['payload']['fetched_at'])<timedelta(hours=24):
                payload=old['payload'] | {'status':'stale','message':'Live refresh failed. Showing cached source data; check its timestamp.'}
            else:
                payload={'status':'unavailable','fetched_at':None,'message':'Live source unavailable. No substitute headlines or forecasts were generated.'} | (empty or {'articles':[]})
            record={'payload':payload,'retry_at':now.timestamp()+300}
        db.execute('INSERT OR REPLACE INTO public_feeds VALUES (?,?)',(key,json.dumps(record)))
        return record['payload'] | {'cached':False}

def news(path):
    def produce(now):
        articles=[]; warnings=[]
        for name,url in NEWS_SOURCES:
            try:
                articles.extend(parse_feed(fetch(url),name,now))
            except (httpx.HTTPError, ValueError, ElementTree.ParseError, DefusedXmlException):
                warnings.append(f'{name} feed unavailable')
        if len(warnings)==len(NEWS_SOURCES): raise ValueError('All sources unavailable')
        unique={a['url']:a for a in articles}
        return {'status':'live','articles':sorted(unique.values(),key=lambda a:a['published_at'],reverse=True)[:15],'fetched_at':now.isoformat(),'warnings':warnings,'sources':[{'name':name,'url':url} for name,url in NEWS_SOURCES], 'message':'Most recent lunar-related entries returned by these feeds; not a complete news archive.'}
    return cached(path,'lunar-news-v1',900,produce)

def weather(path, pad_id, date):
    pad=next((p for p in PADS if p['id']==pad_id),None)
    if pad is None: raise ValueError('Unknown launch area')
    now=datetime.now(timezone.utc)
    if not now.date()<=date<=now.date()+timedelta(days=15):
        return {'status':'out_of_range','pad':pad,'hours':[],'fetched_at':None,'message':'Forecasts cover today through the next 15 days only. No historical or long-range forecast was substituted.'}
    def produce(now):
        url=str(httpx.URL('https://api.open-meteo.com/v1/forecast',params={'latitude':pad['latitude'],'longitude':pad['longitude'],'hourly':'temperature_2m,precipitation_probability,wind_speed_10m,cloud_cover','timezone':'UTC','start_date':date.isoformat(),'end_date':date.isoformat()}))
        data=json.loads(fetch(url))
        if not isinstance(data,dict): raise ValueError('Expected forecast object')
        hourly=data.get('hourly',{}); units=data.get('hourly_units',{})
        if not isinstance(hourly,dict) or not isinstance(units,dict): raise ValueError('Invalid forecast structure')
        fields=['temperature_2m','precipitation_probability','wind_speed_10m','cloud_cover']
        times=hourly.get('time',[])
        if not isinstance(times,list) or not 1<=len(times)<=48 or not all(isinstance(t,str) for t in times) or any(not isinstance(hourly.get(k),list) or len(hourly[k])!=len(times) for k in fields): raise ValueError('Incomplete forecast')
        if any(units.get(k)!=expected for k,expected in zip(fields,['°C','%','km/h','%'])): raise ValueError('Unexpected units')
        hours=[]
        for i,time in enumerate(times):
            timestamp=datetime.fromisoformat(time).replace(tzinfo=timezone.utc)
            if timestamp.date()!=date: raise ValueError('Unexpected forecast date')
            row={'time':timestamp.isoformat()}
            for field in fields:
                value=hourly[field][i]
                if value is not None and (not isinstance(value,(int,float)) or not __import__('math').isfinite(value)):
                    raise ValueError('Invalid forecast value')
                row[field]=value
            hours.append(row)
        return {'status':'live','hours':hours,'pad':pad,'units':units,'fetched_at':now.isoformat(),'source':'https://open-meteo.com/','message':'Open-Meteo modeled weather near the launch area, not an official launch forecast or go/no-go decision. Upper-level winds, lightning constraints and space weather are not assessed.'}
    return cached(path,f'weather-v1-{pad_id}-{date}',1800,produce,{'hours':[],'pad':pad})
