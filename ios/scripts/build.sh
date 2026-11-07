#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(python3 -c 'import json; print(json.load(open("../package.json"))["version"])')"
export GEOMETRY_IOS_VERSION="$VERSION"
python3 - <<'PY'
import os,re
from pathlib import Path
path=Path('project.yml')
text=path.read_text()
version=os.environ['GEOMETRY_IOS_VERSION']
if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version): raise SystemExit('Unexpected version')
path.write_text(re.sub(r"MARKETING_VERSION: '[^']+'", "MARKETING_VERSION: '"+version+"'",text))
major,minor,patch=map(int,version.split('.'))
build_number=major*1000000+minor*1000+patch
text=path.read_text()
path.write_text(re.sub(r"CURRENT_PROJECT_VERSION: '[^']+'", "CURRENT_PROJECT_VERSION: '"+str(build_number)+"'",text))
PY
xcodegen generate --spec project.yml
mkdir -p build/packages
SIMULATOR_ID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; data=json.load(sys.stdin); values=[d["udid"] for runtime,devices in data["devices"].items() if "iOS" in runtime for d in devices if d.get("isAvailable") and d["name"].startswith("iPhone")]; print(values[0] if values else "")')"
if [ -z "$SIMULATOR_ID" ]; then echo 'No available iOS simulator runtime'; exit 1; fi
xcodebuild -project GeometryPanel.xcodeproj -scheme GeometryPanel -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,id=$SIMULATOR_ID" -derivedDataPath build/simulator -resultBundlePath build/SimulatorTests.xcresult -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
for SCHEME in GeometryPanel GeometryPanelWithWidget; do
  xcodebuild -project GeometryPanel.xcodeproj -scheme "$SCHEME" -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "build/$SCHEME" CODE_SIGNING_ALLOWED=NO build
  python3 scripts/package.py "$SCHEME" "$VERSION"
done
python3 - <<'PY'
import hashlib,json,os,subprocess
from pathlib import Path
directory=Path('build/packages')
records=[{'name':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'size':f.stat().st_size,'unsigned':True} for f in sorted(directory.glob('*.ipa'))]
if len(records)!=2: raise SystemExit('Missing unsigned IPA')
proof={'schema':1,'sourceCommit':os.environ.get('GITHUB_SHA',subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()),'version':os.environ['GEOMETRY_IOS_VERSION'],'deviceBuild':True,'simulatorTests':'passed','unsigned':True,'hardwareTested':False,'artifacts':records,'xcode':subprocess.check_output(['xcodebuild','-version'],text=True).strip()}
(directory/'ios-verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
(directory/'SHA256SUMS-iOS.txt').write_text(''.join(r['sha256']+'  '+r['name']+'\n' for r in records))
PY
