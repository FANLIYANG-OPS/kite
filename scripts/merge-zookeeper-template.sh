#!/bin/bash
# Generate ui template from tmp/zookeeper.yaml
# Replace: {{ .Release.Name }} -> __NAME__, {{ .Release.Namespace }} -> __NAMESPACE__, {{ .Values.storageclassname }} -> local
set -e
cd "$(dirname "$0")/.."

OUTPUT="ui/src/templates/zookeeper.yaml"
TMPFILE="/tmp/zookeeper-merge-$$.yaml"

sed -e 's/{{ \.Release\.Name }}/__NAME__/g' \
    -e 's/{{ \.Release\.Namespace }}/__NAMESPACE__/g' \
    -e 's/{{ \.Values\.storageclassname }}/local/g' \
    tmp/zookeeper.yaml > "$TMPFILE"

# Replace ZOO_SERVERS block with placeholder, add namespace and component label
python3 << PYEOF
import re
with open("$TMPFILE", "r") as f:
    content = f.read()

# Replace ZOO_SERVERS multi-line value with placeholder (continuation lines have 12+ spaces)
content = re.sub(
    r'(- name: ZOO_SERVERS\s+value: )[^\n]+(?:\n\s{12,}[^\n]+)*',
    r'\1__ZOO_SERVERS__',
    content,
    count=1
)

# Add namespace and app.kubernetes.io/component to metadata for namespaced resources
docs = content.split('\n---\n')
out = []
for doc in docs:
    if 'kind: ConfigMap' in doc or 'kind: Service' in doc or 'kind: StatefulSet' in doc:
        if 'namespace:' not in doc:
            doc = doc.replace('metadata:\n', 'metadata:\n  namespace: __NAMESPACE__\n', 1)
        if 'app.kubernetes.io/component: zookeeper' not in doc and '  labels:' in doc:
            doc = doc.replace('  labels:\n', '  labels:\n    app.kubernetes.io/component: zookeeper\n', 1)
    out.append(doc)
content = '\n---\n'.join(out)
with open("$OUTPUT", "w") as f:
    f.write(content)
PYEOF

rm -f "$TMPFILE"
echo "✅ Zookeeper template generated from tmp/zookeeper.yaml to $OUTPUT"
