"""Print the generated OpenAPI document, for committing a snapshot that CI can diff:
    python export_spec.py > openapi.json
"""

import json

from main import app

print(json.dumps(app.openapi(), indent=2))
