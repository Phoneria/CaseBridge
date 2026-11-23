"""Private extraction subprocess: stdin/stdout pipes only, no inherited secrets."""
import json
import logging
import sys

# -I excludes the working directory. The parent supplies only this trusted
# application's module root, never a client filename or path.
sys.path.insert(0, sys.argv[1])
if sys.platform == 'linux':
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
logging.getLogger().addHandler(logging.NullHandler())
from app.privacy.files import MAX_BYTES, ExtractionError, extract_document

try:
    result = extract_document(sys.stdin.buffer.read(MAX_BYTES + 1))
except ExtractionError as exc:
    result = {'error': str(exc)}
except Exception:
    result = {'error': 'Belge güvenli kaynak sınırları içinde okunamadı. Daha küçük veya yeniden kaydedilmiş bir kopya yükleyin.'}
sys.stdout.write(json.dumps(result))
