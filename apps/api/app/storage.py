import io,secrets,re,logging,mimetypes
from pathlib import Path
from typing import Protocol
from PIL import Image,ImageOps,UnidentifiedImageError
from fastapi import HTTPException

ROOT=Path('/workspace/uploads')
# Slim images need an explicit mapping; otherwise StaticFiles serves octet-stream.
mimetypes.add_type('image/webp','.webp')
log=logging.getLogger(__name__)
class StorageAdapter(Protocol):
    def save_image(self,data:bytes)->str: ...

class LocalStorage:
    def save_image(self,data):
        if len(data)>5*1024*1024:raise HTTPException(413,'Фото не должно превышать 5 МБ')
        Image.MAX_IMAGE_PIXELS=20000000
        try:
            im=Image.open(io.BytesIO(data))
            if im.format not in ('JPEG','PNG','WEBP'):raise HTTPException(415,'Поддерживаются JPEG, PNG, WebP')
            if im.width*im.height>20000000:raise HTTPException(413,'Слишком большое разрешение изображения')
            im.load();im=ImageOps.exif_transpose(im)
            # Preserve phone orientation, then discard EXIF/GPS/ICC metadata.
            converted=im.convert('RGBA')
            clean=Image.new('RGB',converted.size,'white');clean.paste(converted,mask=converted.getchannel('A'))
            clean.thumbnail((1600,1600),Image.Resampling.LANCZOS)
            thumbnail=clean.copy();thumbnail.thumbnail((480,480),Image.Resampling.LANCZOS)
            full_bytes=io.BytesIO();thumb_bytes=io.BytesIO()
            clean.save(full_bytes,'WEBP',quality=82,method=4)
            thumbnail.save(thumb_bytes,'WEBP',quality=78,method=4)
            ROOT.mkdir(exist_ok=True,parents=True);stem=secrets.token_hex(20);name=stem+'.webp'
            saved=[]
            try:
                for filename,content in [(name,full_bytes.getvalue()),(stem+'.thumb.webp',thumb_bytes.getvalue())]:
                    target=ROOT/filename
                    with target.open('xb') as output:
                        saved.append(target);output.write(content)
            except OSError:
                for target in saved:target.unlink(missing_ok=True)
                raise
            return '/uploads/'+name
        except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning):raise HTTPException(415,'Невозможно прочитать изображение')

    def delete_image(self,path):
        # Only the generated basename can select files. Legacy JPEGs remain valid.
        match=re.fullmatch(r'/uploads/([a-f0-9]{40})\.(jpg|webp)',path)
        if not match:return False
        stem,extension=match.groups()
        names=[stem+'.'+extension]
        if extension=='webp':names.append(stem+'.thumb.webp')
        try:
            for name in names:(ROOT/name).unlink(missing_ok=True)
            return True
        except OSError:
            log.warning('Image cleanup failed; storage error')
            return False

storage=LocalStorage()
