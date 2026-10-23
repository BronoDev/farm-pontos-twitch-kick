"""Pacotes determinísticos: manifest.json sempre na raiz do ZIP, sem assinatura."""
from io import BytesIO
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
checking = '--check' in sys.argv
for browser in ('firefox', 'chromium', 'opera-gx', 'firefox-android'):
    output = BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source in sorted((root / 'instalar' / browser).iterdir()):
            info = zipfile.ZipInfo(source.name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
    data = output.getvalue()
    with zipfile.ZipFile(BytesIO(data)) as archive:
        assert archive.testzip() is None
        assert 'manifest.json' in archive.namelist()
    destination = root / 'downloads' / f'chat-leve-{browser}.zip'
    if checking:
        if not destination.exists() or destination.read_bytes() != data:
            raise SystemExit(f'Pacote desatualizado: {destination.name}. Execute npm run package.')
    else:
        destination.parent.mkdir(exist_ok=True)
        destination.write_bytes(data)
    print(('Validado: ' if checking else 'Criado: ') + str(destination.relative_to(root)))
