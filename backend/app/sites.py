# Geographic feature coordinates, not NASA-approved touchdown points.
SITES = [
    {'id': 'shackleton', 'name': 'Shackleton vicinity', 'latitude': -89.54, 'longitude': 0.0, 'description': 'Exploratory coordinate in the south polar region near Shackleton. Not an exact crater center or certified landing zone.'},
    {'id': 'de-gerlache', 'name': 'de Gerlache vicinity', 'latitude': -88.48, 'longitude': -87.1, 'description': 'Exploratory coordinate near de Gerlache. Not an exact crater center; local slopes require a DEM.'},
    {'id': 'connecting-ridge', 'name': 'South pole ridge reference', 'latitude': -89.0, 'longitude': -45.0, 'description': 'Exploratory coordinate between polar features; not an official candidate site.'},
]

NASA_ARTIFACTS = 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html'
NASA_APOLLO = 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apolloland.html'
NASA_CLPS = 'https://www.nasa.gov/commercial-lunar-payload-services/clps-providers/'


def mission(identifier, name, country, operator, region, classification, status,
            event_date=None, coordinates=None, *, source=NASA_ARTIFACTS,
            frame='MOON_ME_DE421', coordinate_note='Published coordinates; accuracy not specified.',
            relay=None):
    latitude, longitude = coordinates if coordinates is not None else (None, None)
    return {
        'id': identifier, 'name': name, 'country': country, 'operator': operator,
        'site_name': region, 'classification': classification, 'status': status,
        'event_date': event_date, 'latitude': latitude, 'longitude': longitude,
        'coordinate_frame': frame if coordinates else None,
        'coordinate_note': coordinate_note if coordinates else 'No verified touchdown or impact coordinate in this record.',
        'source_url': source, 'relay': relay,
    }


def soft(identifier, name, country, operator, region, date, coordinates, **metadata):
    return mission(identifier, name, country, operator, region, 'soft_landing',
                   'Successful soft landing', date, coordinates, **metadata)


def planned(identifier, name, country, operator, region, source=NASA_CLPS, relay=None):
    return mission(identifier, name, country, operator, region, 'approximate_target_region',
                   'Announced target region', source=source, relay=relay)


MISSION_SITES = [
    *[soft(f'apollo-{number}', f'Apollo {number}', 'United States', 'NASA', region, date,
           coordinates, source=NASA_APOLLO) for number, region, date, coordinates in [
        (11, 'Mare Tranquillitatis', '1969-07-20', (0.674, 23.473)),
        (12, 'Oceanus Procellarum', '1969-11-19', (-3.013, -23.422)),
        (14, 'Fra Mauro', '1971-02-05', (-3.646, -17.472)),
        (15, 'Hadley Rille', '1971-07-30', (26.132, 3.633)),
        (16, 'Descartes', '1972-04-20', (-8.973, 15.501)),
        (17, 'Taurus-Littrow', '1972-12-11', (20.191, 30.772)),
    ]],
    soft('surveyor-1', 'Surveyor 1', 'United States', 'NASA', 'Flamsteed P', '1966-06-02', (-2.4745, -43.3398)),
    mission('surveyor-2', 'Surveyor 2', 'United States', 'NASA', 'Southeast of Copernicus',
            'failed_landing', 'Lunar impact after a propulsion failure', '1966-09-22'),
    soft('surveyor-3', 'Surveyor 3', 'United States', 'NASA', 'Oceanus Procellarum', '1967-04-20', (-3.0162, -23.4180)),
    mission('surveyor-4', 'Surveyor 4', 'United States', 'NASA', 'Sinus Medii',
            'failed_landing', 'Contact lost during descent', '1967-07-17'),
    soft('surveyor-5', 'Surveyor 5', 'United States', 'NASA', 'Mare Tranquillitatis', '1967-09-11', (1.4551, 23.1943)),
    soft('surveyor-6', 'Surveyor 6', 'United States', 'NASA', 'Sinus Medii', '1967-11-10', (0.4742, -1.4275)),
    soft('surveyor-7', 'Surveyor 7', 'United States', 'NASA', 'Tycho north rim', '1968-01-10', (-40.9812, -11.5127)),
    mission('luna-2', 'Luna 2', 'Soviet Union', 'Soviet lunar program', 'Approximate impact region',
            'confirmed_impact', 'Confirmed lunar impact, exact location unknown', '1959-09-13'),
    soft('luna-9', 'Luna 9', 'Soviet Union', 'Soviet lunar program', 'Oceanus Procellarum',
         '1966-02-03', (7.13, -64.37), frame='Historical lunar coordinates; source frame unspecified',
         coordinate_note='Approximate historical landing location.'),
    soft('luna-13', 'Luna 13', 'Soviet Union', 'Soviet lunar program', 'Oceanus Procellarum',
         '1966-12-24', (18.87, -62.05), frame='Historical lunar coordinates; source frame unspecified',
         coordinate_note='Approximate historical landing location.'),
    soft('luna-16', 'Luna 16', 'Soviet Union', 'Soviet lunar program', 'Mare Fecunditatis', '1970-09-20', (-0.5137, 56.3638)),
    soft('luna-17', 'Luna 17', 'Soviet Union', 'Soviet lunar program', 'Mare Imbrium (Lunokhod 1)', '1970-11-17', (38.23764, -35.00163)),
    mission('luna-18', 'Luna 18', 'Soviet Union', 'Soviet lunar program', 'Mare Fecunditatis vicinity',
            'failed_landing', 'Lunar impact during landing attempt', '1971-09-11'),
    soft('luna-20', 'Luna 20', 'Soviet Union', 'Soviet lunar program', 'Apollonius highlands', '1972-02-21', (3.7863, 56.6242)),
    soft('luna-21', 'Luna 21', 'Soviet Union', 'Soviet lunar program', 'Le Monnier (Lunokhod 2)', '1973-01-15', (25.9994, 30.4076)),
    mission('luna-23', 'Luna 23', 'Soviet Union', 'Soviet lunar program', 'Mare Crisium',
            'limited_landing', 'Landed, but sample return was unsuccessful', '1974-11-06', (12.6667, 62.1511)),
    soft('luna-24', 'Luna 24', 'Soviet Union', 'Soviet lunar program', 'Mare Crisium', '1976-08-18', (12.7142, 62.2129)),
    soft('change-3', "Chang'e 3", 'China', 'CNSA', 'Mare Imbrium', '2013-12-14', (44.1214, -19.5117)),
    soft('change-4', "Chang'e 4", 'China', 'CNSA', 'Von Kármán crater', '2019-01-03', (-45.4561, 177.5885),
         relay='Queqiao relay used for far-side communication.'),
    soft('change-5', "Chang'e 5", 'China', 'CNSA', 'Oceanus Procellarum', '2020-12-01', (43.0576, -51.9161)),
    soft('change-6', "Chang'e 6", 'China', 'CNSA', 'Apollo basin', '2024-06-01', (-41.6385, -153.9852),
         relay='Queqiao-2 relay used for far-side communication.'),
    soft('chandrayaan-3', 'Chandrayaan-3 Vikram', 'India', 'ISRO', 'Shiv Shakti Point', '2023-08-23', (-69.3741, 32.32)),
    mission('slim', 'SLIM', 'Japan', 'JAXA', 'Shioli crater vicinity',
            'limited_landing', 'Landed with an off-nominal orientation', '2024-01-19', (-13.3160, 25.2510)),
    mission('im-1', 'IM-1 Odysseus', 'United States', 'Intuitive Machines', 'Malapert A',
            'limited_landing', 'Landed with operational limitations', '2024-02-22', (-80.13, 1.44)),
    mission('im-2', 'IM-2 Athena', 'United States', 'Intuitive Machines', 'Mons Mouton',
            'limited_landing', 'Landed with operational limitations', '2025-03-06', (-84.7906, 29.1957)),
    soft('blue-ghost-1', 'Blue Ghost Mission 1', 'United States', 'Firefly Aerospace', 'Mare Crisium', '2025-03-02', (18.562, 61.810)),
    mission('peregrine-1', 'Peregrine Mission 1', 'United States', 'Astrobotic', 'Moon landing not reached',
            'failed_landing', 'Mission ended in Earth re-entry', source=NASA_CLPS),
    mission('hakuto-r-1', 'HAKUTO-R Mission 1', 'Japan', 'ispace', 'Atlas crater vicinity',
            'failed_landing', 'Confirmed lunar impact', '2023-04-25', (47.581, 44.094)),
    mission('hakuto-r-2', 'HAKUTO-R Mission 2 RESILIENCE', 'Japan', 'ispace', 'Mare Frigoris',
            'failed_landing', 'Hard landing reported by the operator', '2025-06-05',
            source='https://www.ispace-inc.com/2025/06/06/status-update-on-ispace-mission-2-smbc-x-hakuto-r-venture-moon/'),
    planned('im-3', 'IM-3', 'United States', 'Intuitive Machines', 'Reiner Gamma'),
    planned('im-4', 'IM-4', 'United States', 'Intuitive Machines', 'Lunar south pole'),
    planned('blue-ghost-2', 'Blue Ghost Mission 2', 'United States', 'Firefly Aerospace', 'Lunar far side', relay='Mission plan includes a communications relay.'),
    planned('blue-ghost-3', 'Blue Ghost Mission 3', 'United States', 'Firefly Aerospace', 'Gruithuisen Domes'),
    planned('griffin-1', 'Griffin Mission 1', 'United States', 'Astrobotic', 'Mons Mouton'),
    planned('draper-series-2', 'Draper SERIES-2', 'United States', 'Draper', 'Schrödinger Basin', relay='Far-side target region.'),
    planned('blue-moon-mk1', 'Blue Moon MK1', 'United States', 'Blue Origin', 'South polar region'),
    planned('artemis-iv', 'Artemis IV', 'United States', 'NASA', 'Lunar south pole',
            'https://www.nasa.gov/missions/artemis/nasa-shares-plans-to-accelerate-artemis-return-to-moon/'),
    planned('change-7', "Chang'e 7", 'China', 'CNSA', 'South Pole–Aitken basin',
            'https://www.cnsa.gov.cn/english/n6465652/n6465653/c6840870/part/6797907.pdf'),
    planned('change-8', "Chang'e 8", 'China', 'CNSA', 'Leibnitz-Beta Plateau',
            'https://www.cnsa.gov.cn/english/n6465652/n6465653/c10670293/content.html'),
]
