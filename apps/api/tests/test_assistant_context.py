from datetime import datetime,timezone

def test_rain_forecast_keeps_dates_unknown_values_and_local_midnight():
    from app.assistant.service import tool_context
    weather={'source':'Open-Meteo','status':'cached','timezone':'Asia/Almaty','field':{'name':'Северное'},
      'current':{'time':'2026-10-04T23:45','temperature_2m':1.9,'precipitation':0.0},
      'days':[{'date':'2026-10-05','precipitation_sum':None,'precipitation_probability_max':None},
              {'date':'2026-10-06','precipitation_sum':5.7,'precipitation_probability_max':100,'temperature_2m_min':1.3,'temperature_2m_max':3.4,'wind_speed_10m_max':36.9}]}
    before_midnight=datetime(2026,10,4,18,tzinfo=timezone.utc)
    rain=tool_context('get_field_weather',weather,'Когда будет дождь?',at=before_midnight)
    assert '2026-10-06, 5.7 мм' in rain and 'Asia/Almaty' in rain
    assert '"date":"2026-10-05","precipitation_sum":null' in rain
    assert 'не ноль' in rain and 'не доказывает отсутствие осадков до неё' in rain
    assert 'точный час' in rain
    weekly=tool_context('get_field_weather',weather,'Прогноз на ближайшую неделю',at=before_midnight)
    assert '2026-10-06' in weekly and '5.7' in weekly
    # The cached observation is still yesterday, but the request is after midnight
    # in Almaty. Tomorrow must be October 6, not October 5.
    after_midnight=datetime(2026,10,4,20,tzinfo=timezone.utc)
    tomorrow=tool_context('get_field_weather',weather,'Какая завтра погода?',at=after_midnight)
    assert 'дата запроса 2026-10-05' in tomorrow and 'Прогноз на 2026-10-06' in tomorrow and '5.7 мм' in tomorrow
    assert 'наблюдение 2026-10-04T23:45' in tomorrow
    current=tool_context('get_field_weather',weather,'Какая погода сегодня?',at=after_midnight)
    assert 'Текущие условия' in current and 'осадки 0.0 мм' in current and '5.7 мм' not in current
    for zone in (None,'Not/AZone'):
        fallback=tool_context('get_field_weather',{**weather,'timezone':zone},'Какая завтра погода?',at=after_midnight)
        assert 'UTC (часовой пояс источника отсутствует или некорректен)' in fallback
        assert 'дата запроса 2026-10-04' in fallback and 'Прогноз на 2026-10-05' in fallback and 'осадки None' in fallback


def test_followup_retains_individual_soil_and_demo_facts_after_large_weather():
    from app.assistant.service import history_tool_context
    tools=[
      {'name':'get_field_weather','result':{'source':'Open-Meteo','timezone':'Asia/Almaty','current':{'time':'2026-10-04T20:00'},'hourly':{'time':['large weather data']*2000},'days':[{'date':'2026-10-05','temperature_2m_min':1.3,'precipitation_sum':5.7}]}},
      {'name':'get_field_soil','result':{'source':'ISRIC SoilGrids v2','topsoil':{'phh2o':6.683},'warning':'Глобальная модель почвы, не лабораторный анализ поля.'}},
      {'name':'get_field_analysis','result':{'created_at':'2026-10-03T20:21:40Z','recommendation':{'dataset_kind':'DEMO_SYNTHETIC','candidates':[{'crop':'flax','score':0.3715}],'reasons':['pH почвы: 6.68']},'risk':{'flags':[{'text':'Прогнозируются заморозки.'}]}}}
    ]
    contexts=history_tool_context(tools,'Что лучше посадить?',at=datetime(2026,10,4,18,tzinfo=timezone.utc))
    assert len(contexts)==3
    by_tool={tool['name']:context['content'] for tool,context in zip(tools,contexts)}
    assert '2026-10-05' in by_tool['get_field_weather'] and '5.7' in by_tool['get_field_weather']
    assert '6.683' in by_tool['get_field_soil'] and 'не лаборатор' in by_tool['get_field_soil']
    assert 'DEMO_SYNTHETIC' in by_tool['get_field_analysis'] and '6.68' in by_tool['get_field_analysis']
    assert '0.3715' in by_tool['get_field_analysis'] and 'заморозки' in by_tool['get_field_analysis']
    assert all(len(message['content'])<2000 for message in contexts)
