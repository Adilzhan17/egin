import pytest
from app.soilgrids_raster import normalized

@pytest.mark.parametrize('key,raw,expected',[('clay',270,27),('phh2o',68,6.8),('soc',475,47.5),('bdod',116,1.16),('cec',435,43.5),('nitrogen',120,1.2)])
def test_isric_mapped_units_converted_once(key,raw,expected):
    assert normalized(key,[raw,raw,raw])==expected

def test_soil_depth_weighting_and_incomplete_coverage():
    assert normalized('phh2o',[60,70,80])==7.333
    assert normalized('phh2o',[60,None,80]) is None
    assert normalized('phh2o',[0,0,0]) is None
    assert normalized('bdod',[0,0,0]) is None
    assert normalized('soc',[-32768,100,100]) is None
