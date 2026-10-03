"""Collect measured/provider features; never fill missing facts with demo values."""
from datetime import datetime,timezone

def build(field,weather,soil,climate):
    top=soil.get('topsoil',{})
    days=weather.get('days',[])
    full={'latitude':field['lat'],'longitude':field['lon'],'month':datetime.now(timezone.utc).month,'field_area_ha':float(field['area_ha']),
      'ph':top.get('phh2o'),'soc':top.get('soc'),'clay':top.get('clay'),'sand':top.get('sand'),'silt':top.get('silt'),'cec':top.get('cec'),'bulk_density':top.get('bdod'),
      'growing_temperature':climate.get('growing_temperature'),'growing_precipitation':climate.get('growing_precipitation'),
      'forecast_et0_7d':sum(d['et0_fao_evapotranspiration'] for d in days) if len(days)==7 and all(d.get('et0_fao_evapotranspiration') is not None for d in days) else None}
    return full
