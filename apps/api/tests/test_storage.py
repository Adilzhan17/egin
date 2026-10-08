import io

from fastapi import HTTPException
from PIL import Image
import pytest

from app import storage as module


def test_upload_produces_webp_and_mobile_thumbnail_without_metadata(tmp_path,monkeypatch):
    monkeypatch.setattr(module,'ROOT',tmp_path)
    source=Image.new('RGB',(3200,1800),'green')
    exif=Image.Exif();exif[270]='Private phone metadata';exif[274]=6
    raw=io.BytesIO();source.save(raw,'JPEG',exif=exif)
    path=module.storage.save_image(raw.getvalue())
    assert path.startswith('/uploads/') and path.endswith('.webp')
    main=tmp_path/path.split('/')[-1]
    thumb=main.with_name(main.stem+'.thumb.webp')
    with Image.open(main) as large,Image.open(thumb) as small:
        assert large.format==small.format=='WEBP'
        assert large.size==(900,1600) and small.size==(270,480)
        assert not large.getexif() and not small.getexif()
        assert 'icc_profile' not in large.info and 'exif' not in large.info
    assert thumb.stat().st_size<main.stat().st_size
    assert module.storage.delete_image(path) is True
    assert not main.exists() and not thumb.exists()


def test_storage_keeps_legacy_jpeg_supported_and_rejects_traversal(tmp_path,monkeypatch):
    monkeypatch.setattr(module,'ROOT',tmp_path)
    name='a'*40+'.jpg';legacy=tmp_path/name
    Image.new('RGB',(20,20),'blue').save(legacy,'JPEG')
    assert module.storage.delete_image('/uploads/../'+name) is False
    assert legacy.exists()
    assert module.storage.delete_image('/uploads/'+name) is True
    assert not legacy.exists()


@pytest.mark.parametrize('content,status',[(b'<script>not an image</script>',415),(b'x'*(5*1024*1024+1),413)])
def test_storage_invalid_and_oversize_inputs_leave_no_files(tmp_path,monkeypatch,content,status):
    monkeypatch.setattr(module,'ROOT',tmp_path)
    with pytest.raises(HTTPException) as info:module.storage.save_image(content)
    assert info.value.status_code==status
    assert list(tmp_path.iterdir())==[]


def test_storage_rejects_unsupported_gif(tmp_path,monkeypatch):
    monkeypatch.setattr(module,'ROOT',tmp_path)
    raw=io.BytesIO();Image.new('RGB',(20,20),'red').save(raw,'GIF')
    with pytest.raises(HTTPException) as info:module.storage.save_image(raw.getvalue())
    assert info.value.status_code==415
    assert list(tmp_path.iterdir())==[]
